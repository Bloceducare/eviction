import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, getClientIp } from "@/lib/api";
import { getStudentSession } from "@/lib/session";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { recordViolation } from "@/lib/violations";
import { VIOLATION_TYPES } from "@/lib/constants";

const schema = z.object({
  type: z.enum(VIOLATION_TYPES as unknown as [string, ...string[]]),
  detail: z.string().max(500).optional(),
  countStrike: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(clientKey(ip, "attempt-event"), 60, 60_000);
  if (!rl.ok) return jsonError("Too many requests", 429);

  const session = await getStudentSession();
  if (!session) return jsonError("Unauthorized", 401);

  const attempt = await prisma.attempt.findUnique({
    where: { id: session.attemptId },
  });
  if (!attempt || attempt.sessionToken !== session.sessionToken) {
    return jsonError("Session invalidated", 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid event");

  const result = await recordViolation({
    attemptId: attempt.id,
    type: parsed.data.type,
    detail: parsed.data.detail,
    countStrike: parsed.data.countStrike,
  });

  return jsonOk(result);
}
