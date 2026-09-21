"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type ExamDetail = {
  id: string;
  title: string;
  status: string;
  accessCode: string;
  durationMinutes: number;
  config: {
    shuffleOptions: boolean;
    maxViolations: number;
    releaseResults: boolean;
    questionsPerSection?: Record<string, number | null>;
  };
};

const STATUSES = ["DRAFT", "OPEN", "RUNNING", "CLOSED"] as const;

const SECTIONS = [
  "fundamentals",
  "evm_gas",
  "solidity",
  "security",
  "defi",
  "tokens",
  "tooling",
  "open_ended",
] as const;

export default function ExamManagePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [message, setMessage] = useState("");
  const [sectionCounts, setSectionCounts] = useState<
    Record<string, string>
  >({});

  async function load() {
    const res = await fetch(`/api/admin/exams/${id}`);
    if (res.status === 401) {
      router.replace("/admin/login");
      return;
    }
    const data = await res.json();
    setExam(data.exam);
    const qps = data.exam?.config?.questionsPerSection ?? {};
    const next: Record<string, string> = {};
    for (const s of SECTIONS) {
      next[s] = qps[s] == null ? "" : String(qps[s]);
    }
    setSectionCounts(next);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function patch(body: Record<string, unknown>) {
    setMessage("");
    const res = await fetch(`/api/admin/exams/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Update failed");
      return;
    }
    setExam(data.exam);
    setMessage("Saved");
  }

  if (!exam) return <p className="text-muted">Loading…</p>;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-accent underline">
            ← Exams
          </Link>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold">
            {exam.title}
          </h1>
          <p className="mt-1 text-muted">
            Access code:{" "}
            <span className="font-[family-name:var(--font-mono)] text-lg tracking-widest text-ink">
              {exam.accessCode}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/live/${exam.id}`} className="btn btn-primary">
            Live monitor
          </Link>
          <Link href={`/admin/grading/${exam.id}`} className="btn btn-secondary">
            Grading
          </Link>
          <Link href={`/admin/results/${exam.id}`} className="btn btn-secondary">
            Results
          </Link>
        </div>
      </div>

      <section className="card mt-6 space-y-4">
        <h2 className="text-lg font-semibold">Status</h2>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`btn ${exam.status === s ? "btn-primary" : "btn-secondary"}`}
              onClick={() => patch({ status: s })}
            >
              {s === "RUNNING" ? "Start for everyone" : s}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">
          OPEN allows students to log in and wait in the lobby. RUNNING unlocks
          the Start button. Each student&apos;s deadline begins when they click
          Start.
        </p>
      </section>

      <section className="card mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Title</label>
          <input
            className="input"
            value={exam.title}
            onChange={(e) => setExam({ ...exam, title: e.target.value })}
            onBlur={() => patch({ title: exam.title })}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Duration (minutes)
          </label>
          <input
            className="input"
            type="number"
            value={exam.durationMinutes}
            onChange={(e) =>
              setExam({ ...exam, durationMinutes: Number(e.target.value) })
            }
            onBlur={() =>
              patch({ durationMinutes: exam.durationMinutes })
            }
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Max violations before auto-submit
          </label>
          <input
            className="input"
            type="number"
            min={1}
            value={exam.config.maxViolations}
            onChange={(e) =>
              setExam({
                ...exam,
                config: {
                  ...exam.config,
                  maxViolations: Number(e.target.value),
                },
              })
            }
            onBlur={() =>
              patch({
                config: { maxViolations: exam.config.maxViolations },
              })
            }
          />
        </div>
        <div className="flex flex-col justify-end gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={exam.config.shuffleOptions}
              onChange={(e) => {
                const shuffleOptions = e.target.checked;
                setExam({
                  ...exam,
                  config: { ...exam.config, shuffleOptions },
                });
                void patch({ config: { shuffleOptions } });
              }}
            />
            Shuffle answer options per student
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={exam.config.releaseResults}
              onChange={(e) => {
                const releaseResults = e.target.checked;
                setExam({
                  ...exam,
                  config: { ...exam.config, releaseResults },
                });
                void patch({ config: { releaseResults } });
              }}
            />
            Release results to students
          </label>
        </div>
      </section>

      <section className="card mt-6 space-y-3">
        <h2 className="text-lg font-semibold">Questions per section</h2>
        <p className="text-sm text-muted">
          Leave blank to include all questions in that section. Each student
          still gets a random subset and order.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SECTIONS.map((s) => (
            <div key={s}>
              <label className="mb-1 block text-xs font-medium">{s}</label>
              <input
                className="input"
                type="number"
                min={1}
                placeholder="all"
                value={sectionCounts[s] ?? ""}
                onChange={(e) =>
                  setSectionCounts({
                    ...sectionCounts,
                    [s]: e.target.value,
                  })
                }
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            const questionsPerSection: Record<string, number | null> = {};
            for (const s of SECTIONS) {
              const raw = sectionCounts[s]?.trim();
              questionsPerSection[s] = raw
                ? Math.max(1, Number(raw))
                : null;
            }
            void patch({ config: { questionsPerSection } });
          }}
        >
          Save section counts
        </button>
      </section>

      {message && (
        <p className="mt-4 text-sm text-ok" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
