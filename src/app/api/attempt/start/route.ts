import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, getClientIp } from "@/lib/api";
import { getStudentSession } from "@/lib/session";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { ensureActiveSession } from "@/lib/violations";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(clientKey(ip, "attempt-start"), 10, 60_000);
  if (!rl.ok) return jsonError("Too many requests", 429);

  const session = await getStudentSession();
  if (!session) return jsonError("Unauthorized", 401);

  const active = await ensureActiveSession(
    session.attemptId,
    session.sessionToken
  );
  // Allow start even if not yet started (deadline may be null)
  const attempt = await prisma.attempt.findUnique({
    where: { id: session.attemptId },
    include: { exam: true },
  });
  if (!attempt) return jsonError("Attempt not found", 404);
  if (attempt.sessionToken !== session.sessionToken) {
    return jsonError("Session invalidated", 401);
  }
  if (attempt.status !== "IN_PROGRESS") {
    return jsonError("Attempt already submitted", 403);
  }
  if (attempt.exam.status !== "RUNNING") {
    return jsonError("Exam has not been started by the instructor yet", 403);
  }
  if (attempt.startedAt && attempt.deadlineAt) {
    return jsonOk({
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      serverNow: Date.now(),
      alreadyStarted: true,
    });
  }

  const startedAt = new Date();
  const deadlineAt = new Date(
    startedAt.getTime() + attempt.exam.durationMinutes * 60_000
  );

  const updated = await prisma.attempt.update({
    where: { id: attempt.id },
    data: {
      startedAt,
      deadlineAt,
      lastHeartbeat: startedAt,
      disconnected: false,
    },
  });

  await prisma.violationEvent.create({
    data: {
      attemptId: attempt.id,
      type: "EXAM_STARTED",
      detail: `Deadline ${deadlineAt.toISOString()}`,
    },
  });

  void active;

  return jsonOk({
    startedAt: updated.startedAt,
    deadlineAt: updated.deadlineAt,
    serverNow: Date.now(),
    alreadyStarted: false,
  });
}
