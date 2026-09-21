import type { Question } from "@prisma/client";

/** Fields that must NEVER reach a student client. */
const FORBIDDEN = ["answer", "explanation", "rubric"] as const;

export type SanitizedQuestion = {
  id: string;
  section: string;
  difficulty: string;
  type: "mcq" | "multi" | "open";
  text: string;
  code: string | null;
  options: string[] | null;
  points: number;
};

export function sanitizeQuestion(
  q: Question,
  optionOrder?: number[] | null
): SanitizedQuestion {
  let options: string[] | null = null;
  if (q.options) {
    const raw = JSON.parse(q.options) as string[];
    if (optionOrder && optionOrder.length === raw.length) {
      options = optionOrder.map((i) => raw[i]);
    } else {
      options = raw;
    }
  }

  const sanitized: SanitizedQuestion = {
    id: q.id,
    section: q.section,
    difficulty: q.difficulty,
    type: q.type as SanitizedQuestion["type"],
    text: q.text,
    code: q.code,
    options,
    points: q.points,
  };

  for (const key of FORBIDDEN) {
    if (key in sanitized) {
      throw new Error(`Sanitization failed: leaked ${key}`);
    }
  }

  return sanitized;
}

export function assertNoSecrets(payload: unknown): void {
  const json = JSON.stringify(payload);
  for (const key of FORBIDDEN) {
    // Match JSON object keys like "answer":
    if (new RegExp(`"${key}"\\s*:`).test(json)) {
      throw new Error(`Response contains forbidden field: ${key}`);
    }
  }
}

/**
 * Map a student-facing option index back to the original bank index
 * using the persisted shuffle order.
 */
export function unshuffleIndex(
  displayIndex: number,
  optionOrder: number[] | undefined
): number {
  if (!optionOrder || optionOrder.length === 0) return displayIndex;
  return optionOrder[displayIndex] ?? displayIndex;
}

export function unshuffleIndices(
  displayIndices: number[],
  optionOrder: number[] | undefined
): number[] {
  return displayIndices.map((i) => unshuffleIndex(i, optionOrder)).sort((a, b) => a - b);
}
