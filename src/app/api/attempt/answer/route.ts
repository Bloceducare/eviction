import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, getClientIp } from "@/lib/api";
import { getStudentSession } from "@/lib/session";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { ensureActiveSession, isPastDeadline, submitAttempt } from "@/lib/violations";

const schema = z.object({
  questionId: z.string().min(1),
  value: z.union([
    z.number().int().nonnegative(),
    z.array(z.number().int().nonnegative()),
    z.string().max(20000),
    z.null(),
  ]),
  flagged: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(clientKey(ip, "attempt-answer"), 120, 60_000);
  if (!rl.ok) return jsonError("Too many requests", 429);

  const session = await getStudentSession();
  if (!session) return jsonError("Unauthorized", 401);

  const active = await ensureActiveSession(
    session.attemptId,
    session.sessionToken
  );
  if (!active.ok) return jsonError(active.reason, 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid answer payload");

  const attempt = await prisma.attempt.findUniqueOrThrow({
    where: { id: session.attemptId },
  });

  if (!attempt.startedAt) return jsonError("Exam not started", 403);
  if (isPastDeadline(attempt.deadlineAt)) {
    await submitAttempt(attempt.id, "AUTO_SUBMITTED");
    return jsonError("Deadline passed", 403);
  }

  const questionIds = JSON.parse(attempt.questionIds) as string[];
  if (!questionIds.includes(parsed.data.questionId)) {
    return jsonError("Question not in this attempt", 400);
  }

  const stored =
    parsed.data.flagged !== undefined
      ? JSON.stringify({ value: parsed.data.value, flagged: parsed.data.flagged })
      : JSON.stringify(parsed.data.value);

  await prisma.answer.upsert({
    where: {
      attemptId_questionId: {
        attemptId: attempt.id,
        questionId: parsed.data.questionId,
      },
    },
    create: {
      attemptId: attempt.id,
      questionId: parsed.data.questionId,
      value: stored,
    },
    update: { value: stored },
  });

  return jsonOk({ saved: true, savedAt: Date.now() });
}
