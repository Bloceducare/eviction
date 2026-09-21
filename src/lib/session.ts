import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const STUDENT_COOKIE = "exam_student_session";
const ADMIN_COOKIE = "exam_admin_session";

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

export type Session = StudentSession | AdminSession;

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

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const student = jar.get(STUDENT_COOKIE)?.value;
  if (student) {
    const s = await verifySessionToken(student);
    if (s?.role === "student") return s;
  }
  const admin = jar.get(ADMIN_COOKIE)?.value;
  if (admin) {
    const s = await verifySessionToken(admin);
    if (s?.role === "admin") return s;
  }
  return null;
}

export async function getStudentSession(): Promise<StudentSession | null> {
  const s = await getSession();
  return s?.role === "student" ? s : null;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const s = await getSession();
  return s?.role === "admin" ? s : null;
}

export function setStudentCookie(res: NextResponse, token: string) {
  res.cookies.set(STUDENT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export function setAdminCookie(res: NextResponse, token: string) {
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Allow cookies on local http; enable Secure only when serving over HTTPS
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(STUDENT_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getSessionFromRequest(
  req: NextRequest
): Promise<Session | null> {
  const student = req.cookies.get(STUDENT_COOKIE)?.value;
  if (student) {
    const s = await verifySessionToken(student);
    if (s?.role === "student") return s;
  }
  const admin = req.cookies.get(ADMIN_COOKIE)?.value;
  if (admin) {
    const s = await verifySessionToken(admin);
    if (s?.role === "admin") return s;
  }
  return null;
}

export { STUDENT_COOKIE, ADMIN_COOKIE };
