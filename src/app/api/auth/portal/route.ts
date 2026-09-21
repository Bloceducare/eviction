import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, getClientIp } from "@/lib/api";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import {
  signSession,
  setPortalCookie,
  clearAuthCookies,
  getPortalSession,
} from "@/lib/session";
import { loginWithPortal } from "@/lib/portal-auth";

const schema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(128),
});

/** Portal login only — no access code. Lands on /dashboard. */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(clientKey(ip, "portal-login"), 20, 60_000);
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

  const portal = await loginWithPortal(parsed.data.email, parsed.data.password);
  if (!portal.ok) {
    return jsonError(portal.message, portal.status);
  }

  const emailNorm = portal.data.user.email.toLowerCase();
  const name =
    portal.data.user.full_name?.trim() ||
    emailNorm.split("@")[0] ||
    "Student";

  const token = await signSession(
    {
      role: "portal",
      email: emailNorm,
      name,
      portalUserId: portal.data.user.id,
    },
    60 * 60 * 24 * 7
  );

  const res = jsonOk({
    ok: true,
    student: {
      name,
      email: emailNorm,
      cohort: portal.data.user.cohort,
      programme: portal.data.user.programme,
    },
  });
  clearAuthCookies(res);
  setPortalCookie(res, token);
  return res;
}

export async function GET() {
  const portal = await getPortalSession();
  if (!portal) return jsonError("Unauthorized", 401);
  return jsonOk({
    student: {
      name: portal.name,
      email: portal.email,
      portalUserId: portal.portalUserId,
    },
  });
}
