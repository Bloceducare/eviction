"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function StudentLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/portal")
      .then((r) => {
        if (r.ok) router.replace("/dashboard");
      })
      .catch(() => {});
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      window.location.href = "/dashboard";
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-[radial-gradient(ellipse_at_top,_#e8f5f3_0%,_var(--bg)_55%)] p-6">
      <div className="w-full max-w-md">
        <p className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink">
          Web3Bridge
        </p>
        <h1 className="mt-2 text-xl text-muted">Student exam portal</h1>
        <p className="mt-2 text-sm text-muted">
          Sign in once with your portal account. Join exams with an access code
          from your dashboard — no need to re-enter your password each time.
        </p>
        <form onSubmit={onSubmit} method="post" className="card mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              Portal email
            </label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium"
            >
              Portal password
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="current-password"
            />
          </div>
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={loading}
          >
            {loading ? "Signing in…" : "Continue to dashboard"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Instructor?{" "}
          <a href="/admin/login" className="text-accent underline">
            Admin login
          </a>
        </p>
      </div>
    </main>
  );
}
