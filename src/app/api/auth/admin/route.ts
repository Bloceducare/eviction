import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, getClientIp } from "@/lib/api";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import {
  signSession,
  setAdminCookie,
  clearAuthCookies,
} from "@/lib/session";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(clientKey(ip, "admin-login"), 10, 60_000);
  if (!rl.ok) return jsonError("Too many requests", 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid credentials", 401);

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    return jsonError("Admin credentials not configured", 500);
  }

  if (
    parsed.data.email.toLowerCase() !== adminEmail.toLowerCase() ||
    parsed.data.password !== adminPassword
  ) {
    return jsonError("Invalid credentials", 401);
  }

  const token = await signSession({
    role: "admin",
    email: adminEmail.toLowerCase(),
  });

  const res = jsonOk({ ok: true });
  clearAuthCookies(res);
  setAdminCookie(res, token);
  return res;
}
