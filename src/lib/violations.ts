import { prisma } from "./prisma";
import { parseExamConfig } from "./exam-config";
import { STRIKE_TYPES } from "./constants";
import { gradeAttempt } from "./grading";

export async function recordViolation(params: {
  attemptId: string;
  type: string;
  detail?: string;
  countStrike?: boolean;
}): Promise<{
  strikeCount: number;
  maxViolations: number;
  autoSubmitted: boolean;
}> {
  const attempt = await prisma.attempt.findUniqueOrThrow({
    where: { id: params.attemptId },
    include: { exam: true },
  });

  if (attempt.status !== "IN_PROGRESS") {
    return {
      strikeCount: attempt.strikeCount,
      maxViolations: parseExamConfig(attempt.exam.config).maxViolations,
      autoSubmitted: false,
    };
  }

  await prisma.violationEvent.create({
    data: {
      attemptId: params.attemptId,
      type: params.type,
      detail: params.detail ?? null,
    },
  });

  const shouldStrike =
    params.countStrike ?? STRIKE_TYPES.has(params.type);

  let strikeCount = attempt.strikeCount;
  let autoSubmitted = false;
  const config = parseExamConfig(attempt.exam.config);

  if (shouldStrike) {
    strikeCount = attempt.strikeCount + 1;
    await prisma.attempt.update({
      where: { id: params.attemptId },
      data: { strikeCount },
    });

    if (strikeCount >= config.maxViolations) {
      await submitAttempt(params.attemptId, "AUTO_SUBMITTED");
      autoSubmitted = true;
    }
  }

  return {
    strikeCount,
    maxViolations: config.maxViolations,
    autoSubmitted,
  };
}

export async function submitAttempt(
  attemptId: string,
  status: "SUBMITTED" | "AUTO_SUBMITTED" = "SUBMITTED"
) {
  const attempt = await prisma.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { answers: true },
  });

  if (attempt.status !== "IN_PROGRESS") {
    return attempt;
  }

  const questionIds = JSON.parse(attempt.questionIds) as string[];
  const optionOrder = JSON.parse(attempt.optionOrder) as Record<
    string,
    number[]
  >;
  const questions = await prisma.question.findMany({
    where: { id: { in: questionIds } },
  });

  const answersMap: Record<string, unknown> = {};
  for (const a of attempt.answers) {
    answersMap[a.questionId] = JSON.parse(a.value);
  }

  const { autoScore } = gradeAttempt({
    questions,
    answers: answersMap,
    optionOrder,
  });

  const manualScore = attempt.manualScore ?? 0;

  const updated = await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      status,
      submittedAt: new Date(),
      autoScore,
      manualScore,
      totalScore: autoScore + manualScore,
    },
  });

  await prisma.violationEvent.create({
    data: {
      attemptId,
      type: status,
      detail: "Attempt finalized",
    },
  });

  return updated;
}

export function isPastDeadline(deadlineAt: Date | null | undefined): boolean {
  if (!deadlineAt) return false;
  return Date.now() > deadlineAt.getTime();
}

export async function ensureActiveSession(
  attemptId: string,
  sessionToken: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt) return { ok: false, reason: "Attempt not found" };
  if (attempt.sessionToken !== sessionToken) {
    return { ok: false, reason: "Session invalidated" };
  }
  if (attempt.status !== "IN_PROGRESS") {
    return { ok: false, reason: "Attempt already submitted" };
  }
  if (isPastDeadline(attempt.deadlineAt)) {
    await submitAttempt(attemptId, "AUTO_SUBMITTED");
    return { ok: false, reason: "Deadline passed" };
  }
  return { ok: true };
}
