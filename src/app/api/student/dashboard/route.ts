import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { getPortalSession } from "@/lib/session";
import { parseExamConfig } from "@/lib/exam-config";

export async function GET() {
  const portal = await getPortalSession();
  if (!portal) return jsonError("Unauthorized", 401);

  const attempts = await prisma.attempt.findMany({
    where: { studentEmail: portal.email },
    include: { exam: true },
    orderBy: { updatedAt: "desc" },
  });

  const rows = attempts.map((a) => {
    const config = parseExamConfig(a.exam.config);
    const qids = JSON.parse(a.questionIds) as string[];
    return {
      attemptId: a.id,
      examId: a.examId,
      examTitle: a.exam.title,
      examStatus: a.exam.status,
      attemptStatus: a.status,
      startedAt: a.startedAt,
      deadlineAt: a.deadlineAt,
      submittedAt: a.submittedAt,
      questionCount: qids.length,
      strikeCount: a.strikeCount,
      autoScore: config.releaseResults ? a.autoScore : null,
      manualScore: config.releaseResults ? a.manualScore : null,
      totalScore: config.releaseResults ? a.totalScore : null,
      resultsReleased: config.releaseResults,
      canResume:
        a.status === "IN_PROGRESS" &&
        (a.exam.status === "OPEN" || a.exam.status === "RUNNING"),
    };
  });

  return jsonOk({
    student: {
      name: portal.name,
      email: portal.email,
    },
    attempts: rows,
  });
}
