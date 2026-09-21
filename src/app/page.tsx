"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function StudentLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, accessCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      router.push("/exam/lobby");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md">
        <p className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink">
          Web3Bridge
        </p>
        <h1 className="mt-2 text-xl text-muted">Knowledge Assessment</h1>
        <p className="mt-2 text-sm text-muted">
          Sign in with your Student Portal account, then enter the exam access
          code from your instructor.
        </p>
        <form onSubmit={onSubmit} className="card mt-8 space-y-4">
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
          <div>
            <label
              htmlFor="accessCode"
              className="mb-1 block text-sm font-medium"
            >
              Exam access code
            </label>
            <input
              id="accessCode"
              className="input uppercase tracking-widest"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              required
              autoComplete="off"
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
            {loading ? "Signing in…" : "Enter exam lobby"}
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
