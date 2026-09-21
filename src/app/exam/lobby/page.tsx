"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Status = {
  exam: {
    id: string;
    title: string;
    status: string;
    durationMinutes: number;
    maxViolations: number;
  };
  attempt: {
    id: string;
    status: string;
    startedAt: string | null;
    questionCount: number;
    strikeCount: number;
  };
};

const RULES = [
  "The exam runs in fullscreen. Leaving fullscreen is a strike.",
  "Switching tabs or windows is monitored and counts as a strike.",
  "Copy, paste, cut, right-click, and common shortcuts are blocked and logged.",
  "Developer tools detection may count as a strike.",
  "Your answers autosave. The server clock is the source of truth for the timer.",
  "At the maximum number of strikes, your attempt is auto-submitted.",
  "Logging in again from another browser ends your previous session.",
];

export default function LobbyPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/exam/status");
    if (res.status === 401) {
      router.replace("/");
      return;
    }
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to load");
      return;
    }
    if (data.attempt?.status !== "IN_PROGRESS") {
      router.replace("/exam/done");
      return;
    }
    if (data.attempt?.startedAt) {
      router.replace("/exam/take");
      return;
    }
    setStatus(data);
  }, [router]);

  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [load]);

  async function startExam() {
    setStarting(true);
    setError("");
    try {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        /* continue; proctor will require it */
      }
      const res = await fetch("/api/attempt/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start");
        return;
      }
      router.push("/exam/take");
    } catch {
      setError("Network error");
    } finally {
      setStarting(false);
    }
  }

  if (!status) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-muted">{error || "Loading lobby…"}</p>
      </main>
    );
  }

  const waiting = status.exam.status !== "RUNNING";

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <p className="text-sm font-medium text-accent">Web3Bridge Exam</p>
      <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold">
        {status.exam.title}
      </h1>
      <p className="mt-2 text-muted">
        Duration: {status.exam.durationMinutes} minutes ·{" "}
        {status.attempt.questionCount} questions · Max strikes:{" "}
        {status.exam.maxViolations}
      </p>

      <section className="card mt-8">
        <h2 className="text-lg font-semibold">Monitoring rules</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink">
          {RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">
          Note: browsers cannot fully prevent cheating (for example a phone or
          second device). This exam is designed for supervised lab machines.
        </p>
      </section>

      <div className="card mt-6">
        {waiting ? (
          <div>
            <p className="font-medium">Waiting for instructor…</p>
            <p className="mt-1 text-sm text-muted">
              The exam will unlock when the instructor sets status to RUNNING.
              This page refreshes automatically.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-warn">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-warn" />
              Exam status: {status.exam.status}
            </div>
          </div>
        ) : (
          <div>
            <p className="font-medium text-ok">Exam is live</p>
            <p className="mt-1 text-sm text-muted">
              Clicking Start requests fullscreen and begins your personal timer.
            </p>
            {error && (
              <p className="mt-2 text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              className="btn btn-primary mt-4"
              onClick={startExam}
              disabled={starting}
            >
              {starting ? "Starting…" : "Start exam"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
