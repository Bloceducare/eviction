import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { getAdminSession } from "@/lib/session";
import { selectQuestionsForAttempt } from "@/lib/attempt";
import { submitAttempt } from "@/lib/violations";
import { randomUUID } from "crypto";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  action: z.enum(["add_time", "force_submit", "reset"]),
  minutes: z.number().int().min(1).max(120).optional(),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!(await getAdminSession())) return jsonError("Unauthorized", 401);
  const { id: attemptId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid action");

  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt) return jsonError("Not found", 404);

  if (parsed.data.action === "add_time") {
    const minutes = parsed.data.minutes ?? 5;
    if (!attempt.deadlineAt) return jsonError("Attempt not started yet");
    const newDeadline = new Date(
      attempt.deadlineAt.getTime() + minutes * 60_000
    );
    const updated = await prisma.attempt.update({
      where: { id: attemptId },
      data: { deadlineAt: newDeadline },
    });
    return jsonOk({ attempt: updated });
  }

  if (parsed.data.action === "force_submit") {
    const updated = await submitAttempt(attemptId, "AUTO_SUBMITTED");
    return jsonOk({ attempt: updated });
  }

  // reset
  await prisma.answer.deleteMany({ where: { attemptId } });
  await prisma.violationEvent.deleteMany({ where: { attemptId } });
  const { questionIds, optionOrder } = await selectQuestionsForAttempt(
    attempt.examId
  );
  const updated = await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      questionIds: JSON.stringify(questionIds),
      optionOrder: JSON.stringify(optionOrder),
      sessionToken: randomUUID(),
      startedAt: null,
      deadlineAt: null,
      submittedAt: null,
      status: "IN_PROGRESS",
      autoScore: null,
      manualScore: null,
      totalScore: null,
      strikeCount: 0,
      disconnected: false,
      lastHeartbeat: null,
    },
  });
  return jsonOk({ attempt: updated });
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!(await getAdminSession())) return jsonError("Unauthorized", 401);
  const { id: attemptId } = await ctx.params;

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      violations: { orderBy: { createdAt: "asc" } },
      answers: true,
      exam: true,
    },
  });
  if (!attempt) return jsonError("Not found", 404);

  return jsonOk({
    attempt: {
      ...attempt,
      questionIds: JSON.parse(attempt.questionIds),
      optionOrder: JSON.parse(attempt.optionOrder),
    },
  });
}
