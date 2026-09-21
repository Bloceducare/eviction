import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, getClientIp } from "@/lib/api";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import {
  signSession,
  setStudentCookie,
  clearAuthCookies,
} from "@/lib/session";
import { selectQuestionsForAttempt } from "@/lib/attempt";
import { recordViolation } from "@/lib/violations";
import { loginWithPortal } from "@/lib/portal-auth";
import { randomUUID } from "crypto";

const schema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(128),
  accessCode: z.string().trim().min(4).max(12),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(clientKey(ip, "student-login"), 20, 60_000);
  if (!rl.ok) return jsonError("Too many requests", 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { email, password, accessCode } = parsed.data;

  const portal = await loginWithPortal(email, password);
  if (!portal.ok) {
    return jsonError(portal.message, portal.status);
  }

  const exam = await prisma.exam.findUnique({
    where: { accessCode: accessCode.toUpperCase() },
  });

  if (!exam) return jsonError("Invalid access code", 401);
  if (exam.status === "DRAFT" || exam.status === "CLOSED") {
    return jsonError("This exam is not open for login", 403);
  }

  const emailNorm = portal.data.user.email.toLowerCase();
  const name =
    portal.data.user.full_name?.trim() ||
    emailNorm.split("@")[0] ||
    "Student";
  const sessionToken = randomUUID();

  const existing = await prisma.attempt.findUnique({
    where: {
      examId_studentEmail: { examId: exam.id, studentEmail: emailNorm },
    },
  });

  let attemptId: string;

  if (existing) {
    if (existing.status !== "IN_PROGRESS") {
      return jsonError("You have already submitted this exam", 403);
    }

    if (existing.sessionToken) {
      await recordViolation({
        attemptId: existing.id,
        type: "DUPLICATE_SESSION",
        detail: "New login invalidated previous session",
        countStrike: false,
      });
    }

    await prisma.attempt.update({
      where: { id: existing.id },
      data: {
        studentName: name,
        sessionToken,
        disconnected: false,
        lastHeartbeat: new Date(),
      },
    });
    attemptId = existing.id;
  } else {
    const { questionIds, optionOrder } = await selectQuestionsForAttempt(
      exam.id
    );
    const created = await prisma.attempt.create({
      data: {
        examId: exam.id,
        studentName: name,
        studentEmail: emailNorm,
        questionIds: JSON.stringify(questionIds),
        optionOrder: JSON.stringify(optionOrder),
        sessionToken,
        lastHeartbeat: new Date(),
      },
    });
    attemptId = created.id;
  }

  await prisma.violationEvent.create({
    data: {
      attemptId,
      type: "LOGIN",
      detail: `Portal user #${portal.data.user.id} (${portal.data.user.role})`,
    },
  });

  const token = await signSession({
    role: "student",
    attemptId,
    examId: exam.id,
    sessionToken,
    email: emailNorm,
    name,
  });

  const res = jsonOk({
    ok: true,
    examId: exam.id,
    examTitle: exam.title,
    examStatus: exam.status,
    attemptId,
    student: {
      name,
      email: emailNorm,
      cohort: portal.data.user.cohort,
      programme: portal.data.user.programme,
    },
  });
  clearAuthCookies(res);
  setStudentCookie(res, token);
  return res;
}
