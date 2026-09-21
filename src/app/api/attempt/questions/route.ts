import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, getClientIp } from "@/lib/api";
import { getStudentSession } from "@/lib/session";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { sanitizeQuestion, assertNoSecrets } from "@/lib/sanitize";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(clientKey(ip, "attempt-questions"), 60, 60_000);
  if (!rl.ok) return jsonError("Too many requests", 429);

  const session = await getStudentSession();
  if (!session) return jsonError("Unauthorized", 401);

  const attempt = await prisma.attempt.findUnique({
    where: { id: session.attemptId },
    include: { answers: true },
  });
  if (!attempt || attempt.sessionToken !== session.sessionToken) {
    return jsonError("Session invalidated", 401);
  }

  const questionIds = JSON.parse(attempt.questionIds) as string[];
  const optionOrder = JSON.parse(attempt.optionOrder) as Record<
    string,
    number[]
  >;

  const questions = await prisma.question.findMany({
    where: { id: { in: questionIds } },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));

  const sanitized = questionIds.map((id) => {
    const q = byId.get(id);
    if (!q) throw new Error(`Missing question ${id}`);
    return sanitizeQuestion(q, optionOrder[id]);
  });

  const answers: Record<string, unknown> = {};
  const flagged: string[] = [];
  for (const a of attempt.answers) {
    const val = JSON.parse(a.value) as unknown;
    if (
      val &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      "flagged" in (val as object)
    ) {
      const obj = val as { value?: unknown; flagged?: boolean };
      answers[a.questionId] = obj.value ?? null;
      if (obj.flagged) flagged.push(a.questionId);
    } else {
      answers[a.questionId] = val;
    }
  }

  const payload = {
    questions: sanitized,
    answers,
    flagged,
    startedAt: attempt.startedAt,
    deadlineAt: attempt.deadlineAt,
    status: attempt.status,
    strikeCount: attempt.strikeCount,
    serverNow: Date.now(),
  };

  assertNoSecrets(payload);
  return jsonOk(payload);
}
