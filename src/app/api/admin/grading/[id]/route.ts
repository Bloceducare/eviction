import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { getAdminSession } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!(await getAdminSession())) return jsonError("Unauthorized", 401);
  const { id: examId } = await ctx.params;
  const ungradedOnly = req.nextUrl.searchParams.get("ungraded") === "1";

  const attempts = await prisma.attempt.findMany({
    where: {
      examId,
      status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] },
    },
    include: { answers: true },
    orderBy: { studentName: "asc" },
  });

  const openQuestions = await prisma.question.findMany({
    where: { type: "open" },
  });
  const openIds = new Set(openQuestions.map((q) => q.id));
  const openById = new Map(openQuestions.map((q) => [q.id, q]));

  const rows = [];
  for (const a of attempts) {
    const qids = JSON.parse(a.questionIds) as string[];
    const openAnswers = [];
    for (const qid of qids) {
      if (!openIds.has(qid)) continue;
      const q = openById.get(qid)!;
      const ans = a.answers.find((x) => x.questionId === qid);
      let value: unknown = null;
      if (ans) {
        const parsed = JSON.parse(ans.value);
        value =
          parsed && typeof parsed === "object" && "value" in parsed
            ? (parsed as { value: unknown }).value
            : parsed;
      }
      const isUngraded = ans?.manualScore == null;
      if (ungradedOnly && !isUngraded) continue;
      openAnswers.push({
        questionId: qid,
        text: q.text,
        code: q.code,
        points: q.points,
        rubric: q.rubric ? JSON.parse(q.rubric) : [],
        value,
        manualScore: ans?.manualScore ?? null,
        manualFeedback: ans?.manualFeedback ?? null,
        answerId: ans?.id ?? null,
      });
    }
    if (ungradedOnly && openAnswers.length === 0) continue;
    rows.push({
      attemptId: a.id,
      studentName: a.studentName,
      studentEmail: a.studentEmail,
      autoScore: a.autoScore,
      manualScore: a.manualScore,
      totalScore: a.totalScore,
      openAnswers,
    });
  }

  return jsonOk({ rows });
}

const gradeSchema = z.object({
  attemptId: z.string(),
  questionId: z.string(),
  manualScore: z.number().min(0),
  manualFeedback: z.string().max(5000).optional(),
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

  const question = await prisma.question.findUnique({
    where: { id: parsed.data.questionId },
  });
  if (!question || question.type !== "open") {
    return jsonError("Not an open question");
  }
  if (parsed.data.manualScore > question.points) {
    return jsonError(`Score cannot exceed ${question.points}`);
  }

  const attempt = await prisma.attempt.findUnique({
    where: { id: parsed.data.attemptId },
    include: { answers: true },
  });
  if (!attempt) return jsonError("Attempt not found", 404);

  await prisma.answer.upsert({
    where: {
      attemptId_questionId: {
        attemptId: parsed.data.attemptId,
        questionId: parsed.data.questionId,
      },
    },
    create: {
      attemptId: parsed.data.attemptId,
      questionId: parsed.data.questionId,
      value: JSON.stringify(""),
      manualScore: parsed.data.manualScore,
      manualFeedback: parsed.data.manualFeedback ?? null,
    },
    update: {
      manualScore: parsed.data.manualScore,
      manualFeedback: parsed.data.manualFeedback ?? null,
    },
  });

  // Recalc total manual score
  const answers = await prisma.answer.findMany({
    where: { attemptId: parsed.data.attemptId },
  });
  const manualScore = answers.reduce(
    (sum, a) => sum + (a.manualScore ?? 0),
    0
  );
  const autoScore = attempt.autoScore ?? 0;
  const updated = await prisma.attempt.update({
    where: { id: parsed.data.attemptId },
    data: {
      manualScore,
      totalScore: autoScore + manualScore,
    },
  });

  return jsonOk({ attempt: updated });
}
