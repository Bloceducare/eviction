import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api";
import { getAdminSession } from "@/lib/session";
import { parseExamConfig } from "@/lib/exam-config";
import { recordViolation } from "@/lib/violations";

type Ctx = { params: Promise<{ id: string }> };

const OFFLINE_MS = 60_000;

function serializeAttempt(
  a: {
    id: string;
    studentName: string;
    studentEmail: string;
    status: string;
    startedAt: Date | null;
    deadlineAt: Date | null;
    submittedAt: Date | null;
    strikeCount: number;
    lastHeartbeat: Date | null;
    disconnected: boolean;
    questionIds: string;
    autoScore: number | null;
    manualScore: number | null;
    totalScore: number | null;
    answers: { questionId: string }[];
    violations: { type: string; detail: string | null; createdAt: Date }[];
  },
  now: number
) {
  const questionIds = JSON.parse(a.questionIds) as string[];
  const answered = a.answers.length;
  const lastHb = a.lastHeartbeat?.getTime() ?? 0;
  const offline =
    a.status === "IN_PROGRESS" &&
    a.startedAt &&
    now - lastHb > OFFLINE_MS;

  let displayStatus = "waiting";
  if (a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED") {
    displayStatus = a.status === "AUTO_SUBMITTED" ? "auto_submitted" : "submitted";
  } else if (offline) {
    displayStatus = "offline";
  } else if (a.startedAt) {
    displayStatus = "in_progress";
  }

  const lastViolation = a.violations[0] ?? null;
  const remainingMs = a.deadlineAt
    ? Math.max(0, a.deadlineAt.getTime() - now)
    : null;

  return {
    id: a.id,
    studentName: a.studentName,
    studentEmail: a.studentEmail,
    status: a.status,
    displayStatus,
    answered,
    total: questionIds.length,
    strikeCount: a.strikeCount,
    remainingMs,
    deadlineAt: a.deadlineAt,
    startedAt: a.startedAt,
    submittedAt: a.submittedAt,
    lastHeartbeat: a.lastHeartbeat,
    lastViolation,
    autoScore: a.autoScore,
    manualScore: a.manualScore,
    totalScore: a.totalScore,
  };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const admin = await getAdminSession();
  if (!admin) return jsonError("Unauthorized", 401);

  const { id: examId } = await ctx.params;
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) return jsonError("Exam not found", 404);

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const tick = async () => {
        const now = Date.now();
        const attempts = await prisma.attempt.findMany({
          where: { examId },
          include: {
            answers: { select: { questionId: true } },
            violations: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
          orderBy: { createdAt: "asc" },
        });

        // Flag offline students and log once
        for (const a of attempts) {
          if (
            a.status === "IN_PROGRESS" &&
            a.startedAt &&
            a.lastHeartbeat &&
            now - a.lastHeartbeat.getTime() > OFFLINE_MS &&
            !a.disconnected
          ) {
            await prisma.attempt.update({
              where: { id: a.id },
              data: { disconnected: true },
            });
            await recordViolation({
              attemptId: a.id,
              type: "OFFLINE",
              detail: "No heartbeat for 60s+",
              countStrike: false,
            });
          }
        }

        const attemptIds = attempts.map((a) => a.id);
        const nameByAttempt = new Map(
          attempts.map((a) => [a.id, a.studentName] as const)
        );
        const recentEvents =
          attemptIds.length === 0
            ? []
            : await prisma.violationEvent.findMany({
                where: { attemptId: { in: attemptIds } },
                orderBy: { createdAt: "desc" },
                take: 80,
              });

        const activityLog = recentEvents.map((ev) => ({
          id: ev.id,
          attemptId: ev.attemptId,
          studentName: nameByAttempt.get(ev.attemptId) ?? "Unknown",
          type: ev.type,
          detail: ev.detail,
          createdAt: ev.createdAt,
        }));

        send({
          type: "snapshot",
          exam: {
            id: exam.id,
            title: exam.title,
            status: exam.status,
            config: parseExamConfig(exam.config),
          },
          serverNow: now,
          students: attempts.map((a) => serializeAttempt(a, now)),
          activityLog,
        });
      };

      await tick();
      const interval = setInterval(() => {
        tick().catch(console.error);
      }, 3000);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
