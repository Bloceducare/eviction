import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const PORTAL_COOKIE = "exam_portal_session";
const STUDENT_COOKIE = "exam_student_session";
const ADMIN_COOKIE = "exam_admin_session";

/** Logged into Student Portal — can use the dashboard without an active exam. */
export type PortalSession = {
  role: "portal";
  email: string;
  name: string;
  portalUserId: number;
};

/** Active exam attempt session (proctored). */
export type StudentSession = {
  role: "student";
  attemptId: string;
  examId: string;
  sessionToken: string;
  email: string;
  name: string;
};

export type AdminSession = {
  role: "admin";
  email: string;
};

export type Session = PortalSession | StudentSession | AdminSession;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET must be set (min 16 chars)");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: Session, maxAgeSec = 60 * 60 * 8) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string
): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.role === "admin") {
      return { role: "admin", email: String(payload.email) };
    }
    if (payload.role === "portal") {
      return {
        role: "portal",
        email: String(payload.email),
        name: String(payload.name),
        portalUserId: Number(payload.portalUserId),
      };
    }
    if (payload.role === "student") {
      return {
        role: "student",
        attemptId: String(payload.attemptId),
        examId: String(payload.examId),
        sessionToken: String(payload.sessionToken),
        email: String(payload.email),
        name: String(payload.name),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getPortalSession(): Promise<PortalSession | null> {
  const jar = await cookies();
  const token = jar.get(PORTAL_COOKIE)?.value;
  if (!token) return null;
  const s = await verifySessionToken(token);
  return s?.role === "portal" ? s : null;
}

export async function getStudentSession(): Promise<StudentSession | null> {
  const jar = await cookies();
  const token = jar.get(STUDENT_COOKIE)?.value;
  if (!token) return null;
  const s = await verifySessionToken(token);
  return s?.role === "student" ? s : null;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const s = await verifySessionToken(token);
  return s?.role === "admin" ? s : null;
}

export async function getSession(): Promise<Session | null> {
  return (
    (await getStudentSession()) ??
    (await getPortalSession()) ??
    (await getAdminSession())
  );
}

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: false,
  path: "/",
};

export function setPortalCookie(res: NextResponse, token: string) {
  res.cookies.set(PORTAL_COOKIE, token, {
    ...cookieBase,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export function setStudentCookie(res: NextResponse, token: string) {
  res.cookies.set(STUDENT_COOKIE, token, {
    ...cookieBase,
    maxAge: 60 * 60 * 8,
  });
}

export function setAdminCookie(res: NextResponse, token: string) {
  res.cookies.set(ADMIN_COOKIE, token, {
    ...cookieBase,
    maxAge: 60 * 60 * 12,
  });
}

export function clearAttemptCookie(res: NextResponse) {
  res.cookies.set(STUDENT_COOKIE, "", { ...cookieBase, maxAge: 0 });
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(PORTAL_COOKIE, "", { ...cookieBase, maxAge: 0 });
  res.cookies.set(STUDENT_COOKIE, "", { ...cookieBase, maxAge: 0 });
  res.cookies.set(ADMIN_COOKIE, "", { ...cookieBase, maxAge: 0 });
}

export async function getSessionFromRequest(
  req: NextRequest
): Promise<Session | null> {
  const attempt = req.cookies.get(STUDENT_COOKIE)?.value;
  if (attempt) {
    const s = await verifySessionToken(attempt);
    if (s?.role === "student") return s;
  }
  const portal = req.cookies.get(PORTAL_COOKIE)?.value;
  if (portal) {
    const s = await verifySessionToken(portal);
    if (s?.role === "portal") return s;
  }
  const admin = req.cookies.get(ADMIN_COOKIE)?.value;
  if (admin) {
    const s = await verifySessionToken(admin);
    if (s?.role === "admin") return s;
  }
  return null;
}

export { PORTAL_COOKIE, STUDENT_COOKIE, ADMIN_COOKIE };
