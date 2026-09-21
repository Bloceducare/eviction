import type { Question } from "@prisma/client";
import { unshuffleIndex, unshuffleIndices } from "./sanitize";

export type GradeResult = {
  autoScore: number;
  maxAutoPoints: number;
  details: Record<string, { earned: number; max: number; correct?: boolean }>;
};

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
