import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { getAdminSession } from "@/lib/session";
import { parseExamConfig } from "@/lib/exam-config";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!(await getAdminSession())) return jsonError("Unauthorized", 401);
  const { id: examId } = await ctx.params;
  const format = req.nextUrl.searchParams.get("format");

  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) return jsonError("Not found", 404);

  const attempts = await prisma.attempt.findMany({
    where: { examId },
    orderBy: { studentName: "asc" },
  });

  const questionCounts = attempts.map((a) => {
    const ids = JSON.parse(a.questionIds) as string[];
    return ids.length;
  });
  const maxQ = Math.max(0, ...questionCounts);

  // Max possible score approximation: sum of all bank points for that attempt's questions
  const allQuestions = await prisma.question.findMany();
  const pointsById = new Map(allQuestions.map((q) => [q.id, q.points]));

  const rows = attempts.map((a) => {
    const qids = JSON.parse(a.questionIds) as string[];
    const maxPoints = qids.reduce((s, id) => s + (pointsById.get(id) ?? 0), 0);
    const total = a.totalScore ?? 0;
    const pct = maxPoints > 0 ? Math.round((total / maxPoints) * 1000) / 10 : 0;
    return {
      attemptId: a.id,
      studentName: a.studentName,
      studentEmail: a.studentEmail,
      status: a.status,
      autoScore: a.autoScore,
      manualScore: a.manualScore,
      totalScore: a.totalScore,
      maxPoints,
      percent: pct,
      strikes: a.strikeCount,
      submittedAt: a.submittedAt,
    };
  });

  if (format === "csv") {
    const header = [
      "Name",
      "Email",
      "Status",
      "Auto",
      "Manual",
      "Total",
      "Max",
      "Percent",
      "Strikes",
      "SubmittedAt",
    ];
    const lines = [
      header.join(","),
      ...rows.map((r) =>
        [
          csv(r.studentName),
          csv(r.studentEmail),
          r.status,
          r.autoScore ?? "",
          r.manualScore ?? "",
          r.totalScore ?? "",
          r.maxPoints,
          r.percent,
          r.strikes,
          r.submittedAt?.toISOString() ?? "",
        ].join(",")
      ),
    ];
    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="results-${examId}.csv"`,
      },
    });
  }

  void maxQ;
  return jsonOk({
    exam: { ...exam, config: parseExamConfig(exam.config) },
    rows,
  });
}

function csv(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
