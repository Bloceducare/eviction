import { z } from "zod";

export const examConfigSchema = z.object({
  /** Question bank to draw from */
  bankId: z.string().min(1).optional().nullable(),
  /** How many questions each student gets (random sample). null/omit = all in bank */
  questionCount: z.number().int().positive().nullable().optional(),
  /** Optional stratified draw; omit or null per section = use global questionCount / all */
  questionsPerSection: z
    .record(z.string(), z.number().int().positive().nullable())
    .optional(),
  shuffleOptions: z.boolean().default(true),
  maxViolations: z.number().int().positive().default(3),
  releaseResults: z.boolean().default(false),
});

export type ExamConfig = z.infer<typeof examConfigSchema>;

export const defaultExamConfig: ExamConfig = {
  bankId: null,
  questionCount: null,
  shuffleOptions: true,
  maxViolations: 3,
  releaseResults: false,
};

export function parseExamConfig(raw: string | null | undefined): ExamConfig {
  if (!raw) return defaultExamConfig;
  try {
    const parsed = JSON.parse(raw);
    return examConfigSchema.parse({ ...defaultExamConfig, ...parsed });
  } catch {
    return defaultExamConfig;
  }
}

export function generateAccessCode(length = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function shuffledIndices(n: number): number[] {
  return shuffleInPlace(Array.from({ length: n }, (_, i) => i));
}
