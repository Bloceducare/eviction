import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Soft gate for /admin UI routes. APIs still enforce sessions themselves.
 * Login page stays public.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/admin")) return NextResponse.next();
  if (pathname === "/admin/login") return NextResponse.next();

  const hasAdmin = req.cookies.get("exam_admin_session");
  if (!hasAdmin) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Only gate admin UI pages — never touch /api or static assets.
     * Explicitly exclude login so the form always loads.
     */
    "/admin",
    "/admin/((?!login$).*)",
  ],
};
