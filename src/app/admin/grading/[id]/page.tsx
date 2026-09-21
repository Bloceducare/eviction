"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type OpenAnswer = {
  questionId: string;
  text: string;
  code: string | null;
  points: number;
  rubric: string[];
  value: unknown;
  manualScore: number | null;
  manualFeedback: string | null;
};

type Row = {
  attemptId: string;
  studentName: string;
  studentEmail: string;
  openAnswers: OpenAnswer[];
};

export default function GradingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [ungradedOnly, setUngradedOnly] = useState(true);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch(
      `/api/admin/grading/${id}?ungraded=${ungradedOnly ? "1" : "0"}`
    );
    if (res.status === 401) {
      router.replace("/admin/login");
      return;
    }
    const data = await res.json();
    setRows(data.rows ?? []);
    const s: Record<string, string> = {};
    const f: Record<string, string> = {};
    for (const row of data.rows ?? []) {
      for (const a of row.openAnswers) {
        const key = `${row.attemptId}:${a.questionId}`;
        s[key] = a.manualScore != null ? String(a.manualScore) : "";
        f[key] = a.manualFeedback ?? "";
      }
    }
    setScores(s);
    setFeedback(f);
  }

  useEffect(() => {
    load();
  }, [id, ungradedOnly]);

  async function save(attemptId: string, questionId: string, max: number) {
    const key = `${attemptId}:${questionId}`;
    const manualScore = Number(scores[key]);
    if (Number.isNaN(manualScore) || manualScore < 0 || manualScore > max) {
      setMsg(`Score must be 0–${max}`);
      return;
    }
    const res = await fetch(`/api/admin/grading/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId,
        questionId,
        manualScore,
        manualFeedback: feedback[key] || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Save failed");
      return;
    }
    setMsg("Saved");
    await load();
  }

  return (
    <div>
      <Link href={`/admin/exams/${id}`} className="text-sm text-accent underline">
        ← Manage exam
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Manual grading
        </h1>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ungradedOnly}
            onChange={(e) => setUngradedOnly(e.target.checked)}
          />
          Ungraded only
        </label>
      </div>
      {msg && (
        <p className="mt-2 text-sm text-ok" role="status">
          {msg}
        </p>
      )}

      <div className="mt-6 space-y-8">
        {rows.map((row) => (
          <section key={row.attemptId} className="card">
            <h2 className="font-semibold">
              {row.studentName}{" "}
              <span className="text-sm font-normal text-muted">
                {row.studentEmail}
              </span>
            </h2>
            {row.openAnswers.length === 0 && (
              <p className="mt-2 text-sm text-muted">No open answers to show.</p>
            )}
            {row.openAnswers.map((a) => {
              const key = `${row.attemptId}:${a.questionId}`;
              return (
                <div
                  key={a.questionId}
                  className="mt-4 border-t border-border pt-4"
                >
                  <p className="text-xs text-muted">{a.questionId}</p>
                  <p className="mt-1 font-medium">{a.text}</p>
                  {a.code && (
                    <pre className="code-block mt-2 text-xs">{a.code}</pre>
                  )}
                  <div className="mt-3 grid gap-4 lg:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted">
                        Student answer
                      </p>
                      <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">
                        {String(a.value ?? "(empty)")}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted">
                        Rubric (max {a.points})
                      </p>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                        {a.rubric.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <div>
                          <label className="text-xs">Score</label>
                          <input
                            className="input"
                            type="number"
                            min={0}
                            max={a.points}
                            step={0.5}
                            value={scores[key] ?? ""}
                            onChange={(e) =>
                              setScores({ ...scores, [key]: e.target.value })
                            }
                          />
                        </div>
                        <div className="min-w-[200px] flex-1">
                          <label className="text-xs">Feedback</label>
                          <input
                            className="input"
                            value={feedback[key] ?? ""}
                            onChange={(e) =>
                              setFeedback({
                                ...feedback,
                                [key]: e.target.value,
                              })
                            }
                          />
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() =>
                            void save(row.attemptId, a.questionId, a.points)
                          }
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
        {rows.length === 0 && (
          <p className="text-muted">Nothing to grade right now.</p>
        )}
      </div>
    </div>
  );
}
