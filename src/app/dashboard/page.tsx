"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type AttemptRow = {
  attemptId: string;
  examId: string;
  examTitle: string;
  examStatus: string;
  attemptStatus: string;
  startedAt: string | null;
  submittedAt: string | null;
  questionCount: number;
  strikeCount: number;
  totalScore: number | null;
  resultsReleased: boolean;
  canResume: boolean;
};

export default function StudentDashboardPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/student/dashboard");
    if (res.status === 401) {
      router.replace("/");
      return;
    }
    const data = await res.json();
    setName(data.student?.name ?? "");
    setEmail(data.student?.email ?? "");
    setAttempts(data.attempts ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function joinExam(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    setJoining(true);
    try {
      const res = await fetch("/api/student/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not join exam");
        return;
      }
      window.location.href = data.started ? "/exam/take" : "/exam/lobby";
    } catch {
      setError("Network error");
    } finally {
      setJoining(false);
    }
  }

  async function resume(attemptId: string) {
    setError("");
    const res = await fetch("/api/student/join", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not resume");
      return;
    }
    window.location.href = data.started ? "/exam/take" : "/exam/lobby";
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-muted">Loading dashboard…</p>
      </main>
    );
  }

  const inProgress = attempts.filter((a) => a.canResume);
  const past = attempts.filter((a) => !a.canResume);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-accent">Web3Bridge</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Hi, {name}
          </h1>
          <p className="text-sm text-muted">{email}</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={logout}>
          Log out
        </button>
      </header>

      <section className="card mt-8">
        <h2 className="text-lg font-semibold">Join an exam</h2>
        <p className="mt-1 text-sm text-muted">
          Enter the access code from your instructor. You stay signed in — only
          the code is needed.
        </p>
        <form
          onSubmit={joinExam}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <div className="min-w-[180px] flex-1">
            <label htmlFor="code" className="mb-1 block text-xs font-medium">
              Access code
            </label>
            <input
              id="code"
              className="input uppercase tracking-widest"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              required
              minLength={4}
              placeholder="e.g. AB12CD"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={joining}>
            {joining ? "Joining…" : "Join exam"}
          </button>
        </form>
        {error && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {msg && <p className="mt-3 text-sm text-ok">{msg}</p>}
      </section>

      {inProgress.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Continue</h2>
          <ul className="mt-3 space-y-3">
            {inProgress.map((a) => (
              <li
                key={a.attemptId}
                className="card flex flex-wrap items-center justify-between gap-3 border-accent/30"
              >
                <div>
                  <p className="font-medium">{a.examTitle}</p>
                  <p className="text-xs text-muted">
                    Exam {a.examStatus} · {a.questionCount} questions
                    {a.startedAt ? " · in progress" : " · in lobby"}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void resume(a.attemptId)}
                >
                  {a.startedAt ? "Resume exam" : "Open lobby"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Your exams</h2>
        {past.length === 0 && inProgress.length === 0 && (
          <p className="mt-3 text-sm text-muted">
            No exams yet. Join one with an access code above.
          </p>
        )}
        <ul className="mt-3 space-y-3">
          {past.map((a) => (
            <li key={a.attemptId} className="card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{a.examTitle}</p>
                  <p className="text-xs text-muted">
                    {a.attemptStatus.replace("_", " ")}
                    {a.submittedAt
                      ? ` · ${new Date(a.submittedAt).toLocaleString()}`
                      : ""}
                    {` · ${a.questionCount} questions`}
                    {a.strikeCount > 0 ? ` · ${a.strikeCount} strikes` : ""}
                  </p>
                </div>
                {a.resultsReleased && a.totalScore != null ? (
                  <p className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-semibold">
                    Score: {a.totalScore}
                  </p>
                ) : (
                  <p className="text-xs text-muted">Results not released</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
