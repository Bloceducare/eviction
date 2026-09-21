import { prisma } from "./prisma";
import { parseExamConfig, shuffledIndices, shuffleInPlace } from "./exam-config";
import type { Question } from "@prisma/client";

/**
 * Build a per-student paper: random sample from the exam's bank, random order,
 * and (optionally) shuffled answer options. Different students get different sets.
 */
export async function selectQuestionsForAttempt(examId: string): Promise<{
  questionIds: string[];
  optionOrder: Record<string, number[]>;
  questions: Question[];
}> {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
  const config = parseExamConfig(exam.config);

  let pool: Question[];
  if (config.bankId) {
    pool = await prisma.question.findMany({ where: { bankId: config.bankId } });
  } else {
    // Fallback: first bank, or all questions if no banks yet
    const firstBank = await prisma.questionBank.findFirst({
      orderBy: { createdAt: "asc" },
    });
    pool = firstBank
      ? await prisma.question.findMany({ where: { bankId: firstBank.id } })
      : await prisma.question.findMany();
  }

  if (pool.length === 0) {
    throw new Error("Question bank is empty — add questions before starting");
  }

  let selected: Question[] = [];

  const sectionPlan = config.questionsPerSection;
  const hasSectionPlan =
    sectionPlan && Object.values(sectionPlan).some((v) => v != null);

  if (hasSectionPlan && sectionPlan) {
    const bySection = new Map<string, Question[]>();
    for (const q of pool) {
      const list = bySection.get(q.section) ?? [];
      list.push(q);
      bySection.set(q.section, list);
    }
    for (const [section, qs] of bySection) {
      const want = sectionPlan[section];
      const shuffled = shuffleInPlace([...qs]);
      if (want == null) {
        selected.push(...shuffled);
      } else {
        selected.push(...shuffled.slice(0, Math.min(want, shuffled.length)));
      }
    }
    // If a global cap is also set, trim after stratified draw
    if (config.questionCount != null && selected.length > config.questionCount) {
      selected = shuffleInPlace(selected).slice(0, config.questionCount);
    } else {
      shuffleInPlace(selected);
    }
  } else {
    const shuffled = shuffleInPlace([...pool]);
    const n =
      config.questionCount != null
        ? Math.min(config.questionCount, shuffled.length)
        : shuffled.length;
    selected = shuffled.slice(0, n);
  }

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
