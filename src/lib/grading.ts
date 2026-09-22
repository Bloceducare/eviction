import type { Answer, Question } from "@prisma/client";
import { unshuffleIndex, unshuffleIndices } from "./sanitize";

export type GradeResult = {
  autoScore: number;
  maxAutoPoints: number;
  details: Record<string, { earned: number; max: number; correct?: boolean }>;
};

/** Unwrap `{ value, flagged }` payloads stored by the exam client. */
export function parseAnswerValue(raw: string): unknown {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "value" in parsed
    ) {
      return (parsed as { value: unknown }).value;
    }
    return parsed;
  } catch {
    return raw;
  }
}

/**
 * Grade mcq / multi answers. Open questions contribute 0 to autoScore
 * until the instructor sets manualScore.
 */
export function gradeAttempt(params: {
  questions: Question[];
  answers: Record<string, unknown>;
  optionOrder: Record<string, number[]>;
}): GradeResult {
  let autoScore = 0;
  let maxAutoPoints = 0;
  const details: GradeResult["details"] = {};

  for (const q of params.questions) {
    if (q.type === "open") {
      details[q.id] = { earned: 0, max: q.points };
      continue;
    }

    maxAutoPoints += q.points;
    const rawAnswer = q.answer ? (JSON.parse(q.answer) as number | number[]) : null;
    const studentRaw = params.answers[q.id];
    const order = params.optionOrder[q.id];

    let correct = false;

    if (q.type === "mcq" && typeof studentRaw === "number" && typeof rawAnswer === "number") {
      const original = unshuffleIndex(studentRaw, order);
      correct = original === rawAnswer;
    } else if (
      q.type === "multi" &&
      Array.isArray(studentRaw) &&
      Array.isArray(rawAnswer)
    ) {
      const original = unshuffleIndices(
        studentRaw.filter((n): n is number => typeof n === "number"),
        order
      );
      const expected = [...rawAnswer].sort((a, b) => a - b);
      correct =
        original.length === expected.length &&
        original.every((v, i) => v === expected[i]);
    }

    const earned = correct ? q.points : 0;
    autoScore += earned;
    details[q.id] = { earned, max: q.points, correct };
  }

  return { autoScore, maxAutoPoints, details };
}

/**
 * Recompute attempt totals. Questions with a set `manualScore` use that
 * (overrides auto); otherwise mcq/multi use auto points and open contribute 0.
 */
export function computeAttemptTotals(params: {
  questions: Question[];
  answers: Answer[];
  optionOrder: Record<string, number[]>;
}): { autoScore: number; manualScore: number; totalScore: number; details: GradeResult["details"] } {
  const answersMap: Record<string, unknown> = {};
  const manualByQ = new Map<string, number>();
  for (const a of params.answers) {
    answersMap[a.questionId] = parseAnswerValue(a.value);
    if (a.manualScore != null) manualByQ.set(a.questionId, a.manualScore);
  }

  const { details } = gradeAttempt({
    questions: params.questions,
    answers: answersMap,
    optionOrder: params.optionOrder,
  });

  let autoScore = 0;
  let manualScore = 0;
  for (const q of params.questions) {
    const override = manualByQ.get(q.id);
    if (override != null) {
      manualScore += override;
    } else if (q.type !== "open") {
      autoScore += details[q.id]?.earned ?? 0;
    }
  }

  return {
    autoScore,
    manualScore,
    totalScore: autoScore + manualScore,
    details,
  };
}
