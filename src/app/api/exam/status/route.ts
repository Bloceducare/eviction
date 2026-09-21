import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { getStudentSession, getAdminSession } from "@/lib/session";
import { parseExamConfig } from "@/lib/exam-config";

export async function GET() {
  const student = await getStudentSession();
  const admin = await getAdminSession();

  if (admin) {
    const exams = await prisma.exam.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return jsonOk({ role: "admin", exams });
  }

  if (!student) return jsonError("Unauthorized", 401);

  const exam = await prisma.exam.findUnique({ where: { id: student.examId } });
  if (!exam) return jsonError("Exam not found", 404);

  const attempt = await prisma.attempt.findUnique({
    where: { id: student.attemptId },
  });
  if (!attempt || attempt.sessionToken !== student.sessionToken) {
    return jsonError("Session invalidated", 401);
  }

  const config = parseExamConfig(exam.config);
  const questionIds = JSON.parse(attempt.questionIds) as string[];

  return jsonOk({
    role: "student",
    exam: {
      id: exam.id,
      title: exam.title,
      status: exam.status,
      durationMinutes: exam.durationMinutes,
      maxViolations: config.maxViolations,
      releaseResults: config.releaseResults,
    },
    attempt: {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      submittedAt: attempt.submittedAt,
      strikeCount: attempt.strikeCount,
      questionCount: questionIds.length,
      autoScore: config.releaseResults ? attempt.autoScore : null,
      manualScore: config.releaseResults ? attempt.manualScore : null,
      totalScore: config.releaseResults ? attempt.totalScore : null,
    },
    serverNow: Date.now(),
  });
}
