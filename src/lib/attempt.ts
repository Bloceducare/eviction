import { prisma } from "./prisma";
import { parseExamConfig, shuffledIndices, shuffleInPlace } from "./exam-config";
import type { Question } from "@prisma/client";

export async function selectQuestionsForAttempt(examId: string): Promise<{
  questionIds: string[];
  optionOrder: Record<string, number[]>;
  questions: Question[];
}> {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
  const config = parseExamConfig(exam.config);
  const all = await prisma.question.findMany();

  const bySection = new Map<string, Question[]>();
  for (const q of all) {
    const list = bySection.get(q.section) ?? [];
    list.push(q);
    bySection.set(q.section, list);
  }

  const selected: Question[] = [];
  for (const [section, qs] of bySection) {
    const want = config.questionsPerSection?.[section];
    const pool = shuffleInPlace([...qs]);
    if (want == null) {
      selected.push(...pool);
    } else {
      selected.push(...pool.slice(0, Math.min(want, pool.length)));
    }
  }

  shuffleInPlace(selected);

  const optionOrder: Record<string, number[]> = {};
  if (config.shuffleOptions) {
    for (const q of selected) {
      if (q.options) {
        const opts = JSON.parse(q.options) as string[];
        optionOrder[q.id] = shuffledIndices(opts.length);
      }
    }
  }

  return {
    questionIds: selected.map((q) => q.id),
    optionOrder,
    questions: selected,
  };
}
