import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, getClientIp } from "@/lib/api";
import { getStudentSession } from "@/lib/session";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { isPastDeadline, submitAttempt } from "@/lib/violations";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(clientKey(ip, "heartbeat"), 30, 60_000);
  if (!rl.ok) return jsonError("Too many requests", 429);

  const session = await getStudentSession();
  if (!session) return jsonError("Unauthorized", 401);

  const attempt = await prisma.attempt.findUnique({
    where: { id: session.attemptId },
  });
  if (!attempt || attempt.sessionToken !== session.sessionToken) {
    return jsonError("Session invalidated", 401);
  }

  if (attempt.status !== "IN_PROGRESS") {
    return jsonOk({
      status: attempt.status,
      serverNow: Date.now(),
      deadlineAt: attempt.deadlineAt,
    });
  }

  if (isPastDeadline(attempt.deadlineAt)) {
    await submitAttempt(attempt.id, "AUTO_SUBMITTED");
    return jsonOk({
      status: "AUTO_SUBMITTED",
      serverNow: Date.now(),
      deadlineAt: attempt.deadlineAt,
    });
  }

  await prisma.attempt.update({
    where: { id: attempt.id },
    data: { lastHeartbeat: new Date(), disconnected: false },
  });

  return jsonOk({
    status: attempt.status,
    strikeCount: attempt.strikeCount,
    serverNow: Date.now(),
    deadlineAt: attempt.deadlineAt,
  });
}
