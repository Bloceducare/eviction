import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { getAdminSession } from "@/lib/session";
import {
  computeAttemptTotals,
  parseAnswerValue,
} from "@/lib/grading";
import {
  shuffleIndex,
  shuffleIndices,
  unshuffleIndex,
  unshuffleIndices,
} from "@/lib/sanitize";

type Ctx = { params: Promise<{ id: string }> };

function formatChoice(
  options: string[] | null,
  indices: number | number[] | null
): string {
  if (!options || indices == null) return "(empty)";
  if (typeof indices === "number") {
    return options[indices] ?? `Option ${indices}`;
  }
  if (Array.isArray(indices)) {
    if (indices.length === 0) return "(none selected)";
    return indices.map((i) => options[i] ?? `Option ${i}`).join("; ");
  }
  return String(indices);
}

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!(await getAdminSession())) return jsonError("Unauthorized", 401);
  const { id: examId } = await ctx.params;
  const ungradedOnly = req.nextUrl.searchParams.get("ungraded") === "1";
  const typeFilter = req.nextUrl.searchParams.get("type") ?? "all";
  const qSearch = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();

  const attempts = await prisma.attempt.findMany({
    where: {
      examId,
      status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] },
    },
    include: { answers: true },
    orderBy: { studentName: "asc" },
  });

  const allQuestionIds = new Set<string>();
  for (const a of attempts) {
    for (const qid of JSON.parse(a.questionIds) as string[]) {
      allQuestionIds.add(qid);
    }
  }

  const questions = await prisma.question.findMany({
    where: { id: { in: [...allQuestionIds] } },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));

  const rows = [];
  for (const a of attempts) {
    if (
      qSearch &&
      !a.studentName.toLowerCase().includes(qSearch) &&
      !a.studentEmail.toLowerCase().includes(qSearch)
    ) {
      continue;
    }

    const qids = JSON.parse(a.questionIds) as string[];
    const optionOrder = JSON.parse(a.optionOrder || "{}") as Record<
      string,
      number[]
    >;
    const attemptQuestions = qids
      .map((id) => byId.get(id))
      .filter((q): q is NonNullable<typeof q> => !!q);

    const { details, autoScore, manualScore, totalScore } =
      computeAttemptTotals({
        questions: attemptQuestions,
        answers: a.answers,
        optionOrder,
      });

    const items = [];
    let openPending = 0;
    for (let i = 0; i < qids.length; i++) {
      const qid = qids[i]!;
      const q = byId.get(qid);
      if (!q) continue;

      const ans = a.answers.find((x) => x.questionId === qid);
      const needsManual =
        q.type === "open" && (ans?.manualScore == null);
      if (needsManual) openPending += 1;

      if (typeFilter !== "all" && q.type !== typeFilter) continue;
      if (ungradedOnly && !needsManual) continue;

      const value = ans ? parseAnswerValue(ans.value) : null;
      const order = optionOrder[qid];
      const options = q.options
        ? (JSON.parse(q.options) as string[])
        : null;
      const correctAnswer = q.answer
        ? (JSON.parse(q.answer) as number | number[])
        : null;

      let studentOriginal: number | number[] | null = null;
      if (q.type === "mcq" && typeof value === "number") {
        studentOriginal = unshuffleIndex(value, order);
      } else if (q.type === "multi" && Array.isArray(value)) {
        studentOriginal = unshuffleIndices(
          value.filter((n): n is number => typeof n === "number"),
          order
        );
      }

      const auto = details[qid];
      const effectiveScore =
        ans?.manualScore != null
          ? ans.manualScore
          : q.type === "open"
            ? null
            : (auto?.earned ?? 0);

      items.push({
        index: i + 1,
        questionId: qid,
        key: q.key,
        section: q.section,
        difficulty: q.difficulty,
        type: q.type,
        text: q.text,
        code: q.code,
        options,
        points: q.points,
        rubric: q.rubric ? (JSON.parse(q.rubric) as string[]) : [],
        explanation: q.explanation,
        correctAnswer,
        correctLabel: formatChoice(
          options,
          typeof correctAnswer === "number" || Array.isArray(correctAnswer)
            ? correctAnswer
            : null
        ),
        value,
        studentOriginal,
        studentLabel:
          q.type === "open"
            ? value == null || value === ""
              ? "(empty)"
              : String(value)
            : formatChoice(options, studentOriginal),
        autoEarned: auto?.earned ?? 0,
        autoCorrect: auto?.correct ?? null,
        manualScore: ans?.manualScore ?? null,
        manualFeedback: ans?.manualFeedback ?? null,
        effectiveScore,
        needsManual,
        overridden: ans?.manualScore != null && q.type !== "open",
      });
    }

    if (ungradedOnly && items.length === 0) continue;
    if (typeFilter !== "all" && items.length === 0) continue;

    rows.push({
      attemptId: a.id,
      studentName: a.studentName,
      studentEmail: a.studentEmail,
      status: a.status,
      autoScore,
      manualScore,
      totalScore,
      answers: items,
      openPending,
    });
  }

  return jsonOk({ rows });
}

const gradeSchema = z.object({
  attemptId: z.string(),
  questionId: z.string(),
  manualScore: z.number().min(0).nullable().optional(),
  manualFeedback: z.string().max(5000).nullable().optional(),
  value: z
    .union([
      z.number().int().nonnegative(),
      z.array(z.number().int().nonnegative()),
      z.string().max(20000),
      z.null(),
    ])
    .optional(),
  /** When true, mcq/multi values are bank indices and must be reshuffled for storage. */
  valueAsOriginal: z.boolean().optional(),
  clearOverride: z.boolean().optional(),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!(await getAdminSession())) return jsonError("Unauthorized", 401);
  void (await ctx.params);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON");
  }

  const parsed = gradeSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid input");

  const { attemptId, questionId } = parsed.data;

  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });
  if (!question) return jsonError("Question not found", 404);

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { answers: true },
  });
  if (!attempt) return jsonError("Attempt not found", 404);

  const qids = JSON.parse(attempt.questionIds) as string[];
  if (!qids.includes(questionId)) {
    return jsonError("Question not in this attempt", 400);
  }

  if (
    parsed.data.manualScore != null &&
    parsed.data.manualScore > question.points
  ) {
    return jsonError(`Score cannot exceed ${question.points}`);
  }

  const optionOrderMap = JSON.parse(attempt.optionOrder || "{}") as Record<
    string,
    number[]
  >;
  const order = optionOrderMap[questionId];

  const existing = attempt.answers.find((x) => x.questionId === questionId);
  let nextValue = existing?.value ?? JSON.stringify(null);
  if (parsed.data.value !== undefined) {
    let toStore = parsed.data.value;
    if (
      parsed.data.valueAsOriginal &&
      question.type === "mcq" &&
      typeof toStore === "number"
    ) {
      toStore = shuffleIndex(toStore, order);
    } else if (
      parsed.data.valueAsOriginal &&
      question.type === "multi" &&
      Array.isArray(toStore)
    ) {
      toStore = shuffleIndices(toStore, order);
    }
    nextValue = JSON.stringify(toStore);
  }

  let nextManual: number | null = existing?.manualScore ?? null;
  if (parsed.data.clearOverride) {
    nextManual = null;
  } else if (parsed.data.manualScore !== undefined) {
    nextManual = parsed.data.manualScore;
  }

  let nextFeedback: string | null = existing?.manualFeedback ?? null;
  if (parsed.data.manualFeedback !== undefined) {
    nextFeedback = parsed.data.manualFeedback;
  }

  await prisma.answer.upsert({
    where: {
      attemptId_questionId: { attemptId, questionId },
    },
    create: {
      attemptId,
      questionId,
      value: nextValue,
      manualScore: nextManual,
      manualFeedback: nextFeedback,
    },
    update: {
      value: nextValue,
      manualScore: nextManual,
      manualFeedback: nextFeedback,
    },
  });

  const fresh = await prisma.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { answers: true },
  });
  const attemptQuestions = await prisma.question.findMany({
    where: { id: { in: qids } },
  });
  const totals = computeAttemptTotals({
    questions: attemptQuestions,
    answers: fresh.answers,
    optionOrder: optionOrderMap,
  });

  const updated = await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      autoScore: totals.autoScore,
      manualScore: totals.manualScore,
      totalScore: totals.totalScore,
    },
  });

  return jsonOk({ attempt: updated });
}
