import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, getClientIp } from "@/lib/api";
import { getStudentSession } from "@/lib/session";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { isPastDeadline, submitAttempt } from "@/lib/violations";

const schema = z.object({
  reason: z.enum(["manual", "timer", "strikes"]).optional(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(clientKey(ip, "submit"), 10, 60_000);
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
    return jsonOk({ status: attempt.status, alreadySubmitted: true });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }
  const parsed = schema.safeParse(body);
  const reason = parsed.success ? parsed.data.reason : "manual";

  // Reject late manual submits; timer/strikes may still finalize
  if (reason === "manual" && isPastDeadline(attempt.deadlineAt)) {
    await submitAttempt(attempt.id, "AUTO_SUBMITTED");
    return jsonError("Deadline passed; attempt auto-submitted", 403);
  }

  const status =
    reason === "manual" ? "SUBMITTED" : "AUTO_SUBMITTED";
  const updated = await submitAttempt(attempt.id, status);

  return jsonOk({
    status: updated.status,
    submittedAt: updated.submittedAt,
  });
}
