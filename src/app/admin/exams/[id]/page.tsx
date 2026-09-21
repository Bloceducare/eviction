"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Bank = {
  id: string;
  name: string;
  _count: { questions: number };
};

type ExamDetail = {
  id: string;
  title: string;
  status: string;
  accessCode: string;
  durationMinutes: number;
  config: {
    bankId?: string | null;
    questionCount?: number | null;
    shuffleOptions: boolean;
    maxViolations: number;
    releaseResults: boolean;
    questionsPerSection?: Record<string, number | null>;
  };
};

const STATUSES = ["DRAFT", "OPEN", "RUNNING", "CLOSED"] as const;

export default function ExamManagePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [message, setMessage] = useState("");
  const [questionCountInput, setQuestionCountInput] = useState("");

  async function load() {
    const [examRes, banksRes] = await Promise.all([
      fetch(`/api/admin/exams/${id}`),
      fetch("/api/admin/banks"),
    ]);
    if (examRes.status === 401 || banksRes.status === 401) {
      router.replace("/admin/login");
      return;
    }
    const examData = await examRes.json();
    const banksData = await banksRes.json();
    setExam(examData.exam);
    setBanks(banksData.banks ?? []);
    const qc = examData.exam?.config?.questionCount;
    setQuestionCountInput(qc == null ? "" : String(qc));
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

  const selectedBank = banks.find((b) => b.id === exam.config.bankId);
  const bankSize = selectedBank?._count.questions ?? 0;

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
      </section>

      <section className="card mt-6 space-y-4">
        <h2 className="text-lg font-semibold">Question paper</h2>
        <p className="text-sm text-muted">
          Pick a bank and how many questions each student receives. Every
          student gets a <strong>random sample</strong> in a{" "}
          <strong>random order</strong> (and shuffled options if enabled). With
          a large bank, overlap between students can be low or zero.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Question bank
            </label>
            <select
              className="input"
              value={exam.config.bankId ?? ""}
              onChange={(e) => {
                const bankId = e.target.value || null;
                setExam({
                  ...exam,
                  config: { ...exam.config, bankId },
                });
                void patch({ config: { bankId } });
              }}
            >
              <option value="">Select a bank…</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b._count.questions} questions)
                </option>
              ))}
            </select>
            {selectedBank && (
              <p className="mt-1 text-xs text-muted">
                <Link
                  href={`/admin/banks/${selectedBank.id}`}
                  className="text-accent underline"
                >
                  Manage this bank
                </Link>
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Questions per student
            </label>
            <input
              className="input"
              type="number"
              min={1}
              max={bankSize || undefined}
              placeholder={bankSize ? `1–${bankSize} (blank = all)` : "e.g. 20"}
              value={questionCountInput}
              onChange={(e) => setQuestionCountInput(e.target.value)}
              onBlur={() => {
                const raw = questionCountInput.trim();
                const questionCount = raw
                  ? Math.max(1, Number(raw))
                  : null;
                void patch({ config: { questionCount } });
              }}
            />
            <p className="mt-1 text-xs text-muted">
              Leave blank to give every student the full bank (still shuffled).
            </p>
          </div>
        </div>
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
            onBlur={() => patch({ durationMinutes: exam.durationMinutes })}
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

      {message && (
        <p className="mt-4 text-sm text-ok" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
