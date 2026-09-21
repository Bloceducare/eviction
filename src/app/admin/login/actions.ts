"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { signSession, ADMIN_COOKIE, STUDENT_COOKIE } from "@/lib/session";

export async function adminLoginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    redirect("/admin/login?error=" + encodeURIComponent("Admin credentials not configured"));
  }

  if (
    !email ||
    !password ||
    email.toLowerCase() !== adminEmail.toLowerCase() ||
    password !== adminPassword
  ) {
    redirect("/admin/login?error=" + encodeURIComponent("Invalid credentials"));
  }

  let token: string;
  try {
    token = await signSession({
      role: "admin",
      email: adminEmail.toLowerCase(),
    });
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : "Could not create session (check SESSION_SECRET)";
    redirect("/admin/login?error=" + encodeURIComponent(msg));
  }

  const jar = await cookies();
  jar.set(STUDENT_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // local http; set true only behind HTTPS
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  redirect("/admin");
}
