"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type AnswerItem = {
  index: number;
  questionId: string;
  key: string | null;
  section: string;
  difficulty: string;
  type: string;
  text: string;
  code: string | null;
  options: string[] | null;
  points: number;
  rubric: string[];
  explanation: string | null;
  correctAnswer: number | number[] | null;
  correctLabel: string;
  value: unknown;
  studentOriginal: number | number[] | null;
  studentLabel: string;
  autoEarned: number;
  autoCorrect: boolean | null;
  manualScore: number | null;
  manualFeedback: string | null;
  effectiveScore: number | null;
  needsManual: boolean;
  overridden: boolean;
};

type Row = {
  attemptId: string;
  studentName: string;
  studentEmail: string;
  status: string;
  autoScore: number;
  manualScore: number;
  totalScore: number;
  openPending: number;
  answers: AnswerItem[];
};

type TypeFilter = "all" | "open" | "mcq" | "multi";

export default function GradingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [ungradedOnly, setUngradedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [scores, setScores] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      type: typeFilter,
      ungraded: ungradedOnly ? "1" : "0",
    });
    if (searchDebounced) params.set("q", searchDebounced);
    const res = await fetch(`/api/admin/grading/${id}?${params}`);
    if (res.status === 401) {
      router.replace("/admin/login");
      return;
    }
    const data = await res.json();
    const nextRows: Row[] = data.rows ?? [];
    setRows(nextRows);

    const s: Record<string, string> = {};
    const f: Record<string, string> = {};
    const v: Record<string, string> = {};
    for (const row of nextRows) {
      for (const a of row.answers) {
        const key = `${row.attemptId}:${a.questionId}`;
        s[key] =
          a.manualScore != null
            ? String(a.manualScore)
            : a.type !== "open"
              ? String(a.autoEarned)
              : "";
        f[key] = a.manualFeedback ?? "";
        if (a.type === "open") {
          v[key] = typeof a.value === "string" ? a.value : String(a.value ?? "");
        } else if (a.type === "mcq") {
          v[key] =
            a.studentOriginal != null ? String(a.studentOriginal) : "";
        } else if (a.type === "multi") {
          v[key] = Array.isArray(a.studentOriginal)
            ? a.studentOriginal.join(",")
            : "";
        }
      }
    }
    setScores(s);
    setFeedback(f);
    setEditValues(v);
    setExpanded((prev) => {
      const next = { ...prev };
      for (const row of nextRows) {
        if (next[row.attemptId] === undefined) next[row.attemptId] = true;
      }
      return next;
    });
  }, [id, typeFilter, ungradedOnly, searchDebounced, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const students = rows.length;
    const pending = rows.reduce((n, r) => n + r.openPending, 0);
    const shown = rows.reduce((n, r) => n + r.answers.length, 0);
    return { students, pending, shown };
  }, [rows]);

  async function save(
    attemptId: string,
    item: AnswerItem,
    opts?: { clearOverride?: boolean }
  ) {
    const key = `${attemptId}:${item.questionId}`;
    setSaving(key);
    setMsg("");

    const body: Record<string, unknown> = {
      attemptId,
      questionId: item.questionId,
    };

    if (opts?.clearOverride) {
      body.clearOverride = true;
    } else {
      const scoreRaw = scores[key];
      if (scoreRaw !== undefined && scoreRaw !== "") {
        const manualScore = Number(scoreRaw);
        if (
          Number.isNaN(manualScore) ||
          manualScore < 0 ||
          manualScore > item.points
        ) {
          setMsg(`Score must be 0–${item.points}`);
          setSaving(null);
          return;
        }
        // Only send manualScore when it differs from pure auto, or open
        if (
          item.type === "open" ||
          manualScore !== item.autoEarned ||
          item.overridden
        ) {
          body.manualScore = manualScore;
        }
      } else if (item.type === "open") {
        setMsg("Enter a score for open answers");
        setSaving(null);
        return;
      }

      if (feedback[key] !== undefined) {
        body.manualFeedback = feedback[key] || null;
      }

      // Persist edited answer value (original option indices for mcq/multi)
      if (item.type === "open") {
        const next = editValues[key] ?? "";
        if (next !== String(item.value ?? "")) {
          body.value = next;
        }
      } else if (item.type === "mcq") {
        const raw = editValues[key];
        if (raw !== "" && raw != null) {
          const idx = Number(raw);
          if (!Number.isNaN(idx)) {
            const cur =
              typeof item.studentOriginal === "number"
                ? item.studentOriginal
                : null;
            if (idx !== cur) {
              body.value = idx;
              body.valueAsOriginal = true;
            }
          }
        }
      } else if (item.type === "multi") {
        const raw = editValues[key] ?? "";
        const idxs = raw
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
          .map(Number)
          .filter((n) => !Number.isNaN(n))
          .sort((a, b) => a - b);
        const cur = Array.isArray(item.studentOriginal)
          ? [...item.studentOriginal].sort((a, b) => a - b)
          : [];
        if (JSON.stringify(idxs) !== JSON.stringify(cur)) {
          body.value = idxs;
          body.valueAsOriginal = true;
        }
      }
    }

    const res = await fetch(`/api/admin/grading/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(null);
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
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Review & grade
          </h1>
          <p className="mt-1 text-sm text-muted">
            {totals.students} student{totals.students === 1 ? "" : "s"} ·{" "}
            {totals.shown} answer{totals.shown === 1 ? "" : "s"} shown ·{" "}
            {totals.pending} open pending
          </p>
        </div>
      </div>

      <div className="card mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted">Type</label>
          <select
            className="input"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          >
            <option value="all">All types</option>
            <option value="open">Open (manual)</option>
            <option value="mcq">MCQ</option>
            <option value="multi">Multi</option>
          </select>
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="text-xs text-muted">Student</label>
          <input
            className="input"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={ungradedOnly}
            onChange={(e) => setUngradedOnly(e.target.checked)}
          />
          Ungraded open only
        </label>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            const allOpen = Object.values(expanded).every(Boolean);
            const next: Record<string, boolean> = {};
            for (const r of rows) next[r.attemptId] = !allOpen;
            setExpanded(next);
          }}
        >
          Expand / collapse
        </button>
      </div>

      {msg && (
        <p className="mt-2 text-sm text-ok" role="status">
          {msg}
        </p>
      )}

      <div className="mt-6 space-y-6">
        {rows.map((row) => {
          const open = expanded[row.attemptId] ?? true;
          return (
            <section key={row.attemptId} className="card">
              <button
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                onClick={() =>
                  setExpanded((prev) => ({
                    ...prev,
                    [row.attemptId]: !open,
                  }))
                }
              >
                <div>
                  <h2 className="font-semibold">
                    {row.studentName}{" "}
                    <span className="text-sm font-normal text-muted">
                      {row.studentEmail}
                    </span>
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    {row.status.replace("_", " ").toLowerCase()} · auto{" "}
                    {row.autoScore} · manual {row.manualScore} · total{" "}
                    {row.totalScore}
                    {row.openPending > 0 && (
                      <span className="ml-2 text-warn">
                        · {row.openPending} open ungraded
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-sm text-muted">
                  {open ? "Hide" : "Show"} ({row.answers.length})
                </span>
              </button>

              {open && row.answers.length === 0 && (
                <p className="mt-3 text-sm text-muted">
                  No answers match the current filters.
                </p>
              )}

              {open &&
                row.answers.map((a) => {
                  const key = `${row.attemptId}:${a.questionId}`;
                  return (
                    <div
                      key={a.questionId}
                      className="mt-4 border-t border-border pt-4"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span className="rounded bg-slate-100 px-2 py-0.5">
                          Q{a.index}
                        </span>
                        <span className="rounded bg-slate-100 px-2 py-0.5 uppercase">
                          {a.type}
                        </span>
                        <span className="rounded bg-slate-100 px-2 py-0.5">
                          {a.section}
                        </span>
                        <span className="rounded bg-slate-100 px-2 py-0.5">
                          {a.points} pt{a.points === 1 ? "" : "s"}
                        </span>
                        {a.needsManual && (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-warn">
                            Needs grading
                          </span>
                        )}
                        {a.overridden && (
                          <span className="rounded bg-teal-50 px-2 py-0.5 text-accent">
                            Score overridden
                          </span>
                        )}
                        {a.autoCorrect === true && (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-ok">
                            Auto correct
                          </span>
                        )}
                        {a.autoCorrect === false && (
                          <span className="rounded bg-red-50 px-2 py-0.5 text-danger">
                            Auto incorrect
                          </span>
                        )}
                      </div>

                      <p className="mt-2 font-medium">{a.text}</p>
                      {a.code && (
                        <pre className="code-block mt-2 text-xs">{a.code}</pre>
                      )}

                      <div className="mt-3 grid gap-4 lg:grid-cols-2">
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-semibold uppercase text-muted">
                              Student answer
                            </p>
                            {a.type === "open" ? (
                              <textarea
                                className="input mt-1 min-h-[120px] font-[family-name:var(--font-mono)] text-sm"
                                value={editValues[key] ?? ""}
                                onChange={(e) =>
                                  setEditValues({
                                    ...editValues,
                                    [key]: e.target.value,
                                  })
                                }
                              />
                            ) : a.type === "mcq" && a.options ? (
                              <div className="mt-1 space-y-1">
                                {a.options.map((opt, i) => (
                                  <label
                                    key={i}
                                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm ${
                                      String(editValues[key]) === String(i)
                                        ? "border-accent bg-teal-50"
                                        : "border-border"
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={key}
                                      checked={
                                        String(editValues[key]) === String(i)
                                      }
                                      onChange={() =>
                                        setEditValues({
                                          ...editValues,
                                          [key]: String(i),
                                        })
                                      }
                                    />
                                    <span>
                                      {opt}
                                      {a.correctAnswer === i && (
                                        <span className="ml-2 text-xs text-ok">
                                          (correct)
                                        </span>
                                      )}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            ) : a.type === "multi" && a.options ? (
                              <div className="mt-1 space-y-1">
                                {a.options.map((opt, i) => {
                                  const selected = (editValues[key] ?? "")
                                    .split(",")
                                    .map((x) => x.trim())
                                    .filter(Boolean)
                                    .includes(String(i));
                                  const isCorrect = Array.isArray(
                                    a.correctAnswer
                                  )
                                    ? a.correctAnswer.includes(i)
                                    : false;
                                  return (
                                    <label
                                      key={i}
                                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm ${
                                        selected
                                          ? "border-accent bg-teal-50"
                                          : "border-border"
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={() => {
                                          const cur = (editValues[key] ?? "")
                                            .split(",")
                                            .map((x) => x.trim())
                                            .filter(Boolean);
                                          const next = selected
                                            ? cur.filter((x) => x !== String(i))
                                            : [...cur, String(i)];
                                          setEditValues({
                                            ...editValues,
                                            [key]: next
                                              .sort(
                                                (x, y) => Number(x) - Number(y)
                                              )
                                              .join(","),
                                          });
                                        }}
                                      />
                                      <span>
                                        {opt}
                                        {isCorrect && (
                                          <span className="ml-2 text-xs text-ok">
                                            (correct)
                                          </span>
                                        )}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            ) : (
                              <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">
                                {a.studentLabel}
                              </pre>
                            )}
                          </div>
                          {a.type !== "open" && (
                            <p className="text-xs text-muted">
                              Correct: {a.correctLabel}
                            </p>
                          )}
                          {a.explanation && (
                            <p className="text-xs text-muted">
                              Explanation: {a.explanation}
                            </p>
                          )}
                        </div>

                        <div>
                          {a.rubric.length > 0 && (
                            <>
                              <p className="text-xs font-semibold uppercase text-muted">
                                Rubric (max {a.points})
                              </p>
                              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                                {a.rubric.map((r) => (
                                  <li key={r}>{r}</li>
                                ))}
                              </ul>
                            </>
                          )}
                          <div className="mt-3 flex flex-wrap items-end gap-2">
                            <div>
                              <label className="text-xs">
                                {a.type === "open"
                                  ? "Score"
                                  : "Score (override)"}
                              </label>
                              <input
                                className="input"
                                type="number"
                                min={0}
                                max={a.points}
                                step={0.5}
                                value={scores[key] ?? ""}
                                onChange={(e) =>
                                  setScores({
                                    ...scores,
                                    [key]: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="min-w-[180px] flex-1">
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
                              disabled={saving === key}
                              onClick={() => void save(row.attemptId, a)}
                            >
                              {saving === key ? "Saving…" : "Save"}
                            </button>
                            {a.overridden && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={saving === key}
                                onClick={() =>
                                  void save(row.attemptId, a, {
                                    clearOverride: true,
                                  })
                                }
                              >
                                Clear override
                              </button>
                            )}
                          </div>
                          <p className="mt-2 text-xs text-muted">
                            Effective:{" "}
                            {a.effectiveScore == null
                              ? "—"
                              : a.effectiveScore}{" "}
                            / {a.points}
                            {a.type !== "open" && (
                              <> · auto {a.autoEarned}</>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </section>
          );
        })}
        {rows.length === 0 && (
          <p className="text-muted">
            No submitted attempts match the current filters.
          </p>
        )}
      </div>
    </div>
  );
}
