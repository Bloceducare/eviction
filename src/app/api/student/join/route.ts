import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, getClientIp } from "@/lib/api";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import {
  getPortalSession,
  signSession,
  setStudentCookie,
} from "@/lib/session";
import { selectQuestionsForAttempt } from "@/lib/attempt";
import { recordViolation } from "@/lib/violations";
import { randomUUID } from "crypto";

/** Join or resume an exam using portal session + access code (no password). */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(clientKey(ip, "exam-join"), 20, 60_000);
  if (!rl.ok) return jsonError("Too many requests", 429);

  const portal = await getPortalSession();
  if (!portal) return jsonError("Please sign in first", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON");
  }

  const parsed = z
    .object({
      accessCode: z.string().trim().min(4).max(12),
    })
    .safeParse(body);
  if (!parsed.success) return jsonError("Access code required");

  const exam = await prisma.exam.findUnique({
    where: { accessCode: parsed.data.accessCode.toUpperCase() },
  });
  if (!exam) return jsonError("Invalid access code", 401);
  if (exam.status === "DRAFT" || exam.status === "CLOSED") {
    return jsonError("This exam is not open for login", 403);
  }

  const emailNorm = portal.email;
  const name = portal.name;
  const sessionToken = randomUUID();

  const existing = await prisma.attempt.findUnique({
    where: {
      examId_studentEmail: { examId: exam.id, studentEmail: emailNorm },
    },
  });

  let attemptId: string;

  if (existing) {
    if (existing.status !== "IN_PROGRESS") {
      return jsonError("You have already submitted this exam", 403);
    }
    if (existing.sessionToken) {
      await recordViolation({
        attemptId: existing.id,
        type: "DUPLICATE_SESSION",
        detail: "Resumed from dashboard; previous session invalidated",
        countStrike: false,
      });
    }
    await prisma.attempt.update({
      where: { id: existing.id },
      data: {
        studentName: name,
        sessionToken,
        disconnected: false,
        lastHeartbeat: new Date(),
      },
    });
    attemptId = existing.id;
  } else {
    const { questionIds, optionOrder } = await selectQuestionsForAttempt(
      exam.id
    );
    const created = await prisma.attempt.create({
      data: {
        examId: exam.id,
        studentName: name,
        studentEmail: emailNorm,
        questionIds: JSON.stringify(questionIds),
        optionOrder: JSON.stringify(optionOrder),
        sessionToken,
        lastHeartbeat: new Date(),
      },
    });
    attemptId = created.id;
  }

  await prisma.violationEvent.create({
    data: {
      attemptId,
      type: "LOGIN",
      detail: `Joined via dashboard (portal #${portal.portalUserId})`,
    },
  });

  const token = await signSession({
    role: "student",
    attemptId,
    examId: exam.id,
    sessionToken,
    email: emailNorm,
    name,
  });

  const res = jsonOk({
    ok: true,
    examId: exam.id,
    examTitle: exam.title,
    examStatus: exam.status,
    attemptId,
    started: !!existing?.startedAt,
  });
  setStudentCookie(res, token);
  return res;
}

/** Resume an in-progress attempt from the dashboard. */
export async function PUT(req: NextRequest) {
  const portal = await getPortalSession();
  if (!portal) return jsonError("Please sign in first", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON");
  }

  const parsed = z.object({ attemptId: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return jsonError("attemptId required");

  const attempt = await prisma.attempt.findUnique({
    where: { id: parsed.data.attemptId },
    include: { exam: true },
  });
  if (!attempt || attempt.studentEmail !== portal.email) {
    return jsonError("Attempt not found", 404);
  }
  if (attempt.status !== "IN_PROGRESS") {
    return jsonError("This attempt is already submitted", 403);
  }
  if (attempt.exam.status === "CLOSED" || attempt.exam.status === "DRAFT") {
    return jsonError("Exam is not available", 403);
  }

  const sessionToken = randomUUID();
  if (attempt.sessionToken) {
    await recordViolation({
      attemptId: attempt.id,
      type: "DUPLICATE_SESSION",
      detail: "Resumed from dashboard",
      countStrike: false,
    });
  }
  await prisma.attempt.update({
    where: { id: attempt.id },
    data: {
      sessionToken,
      disconnected: false,
      lastHeartbeat: new Date(),
      studentName: portal.name,
    },
  });

  const token = await signSession({
    role: "student",
    attemptId: attempt.id,
    examId: attempt.examId,
    sessionToken,
    email: portal.email,
    name: portal.name,
  });

  const res = jsonOk({
    ok: true,
    examId: attempt.examId,
    attemptId: attempt.id,
    started: !!attempt.startedAt,
    examStatus: attempt.exam.status,
  });
  setStudentCookie(res, token);
  return res;
}
