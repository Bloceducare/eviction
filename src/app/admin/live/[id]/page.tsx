"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type StudentRow = {
  id: string;
  studentName: string;
  studentEmail: string;
  displayStatus: string;
  answered: number;
  total: number;
  strikeCount: number;
  remainingMs: number | null;
  lastViolation: { type: string; createdAt: string } | null;
};

type ActivityItem = {
  id: string;
  attemptId: string;
  studentName: string;
  type: string;
  detail: string | null;
  createdAt: string;
};

type TimelineEvent = {
  id: string;
  type: string;
  detail: string | null;
  createdAt: string;
};

type StatusFilter = "all" | "in_progress" | "waiting" | "offline" | "submitted" | "auto_submitted";

function fmtRemaining(ms: number | null) {
  if (ms == null) return "—";
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString();
}

function eventTone(type: string) {
  if (
    ["TAB_HIDDEN", "WINDOW_BLUR", "FULLSCREEN_EXIT", "DEVTOOLS_SUSPECTED"].includes(
      type
    )
  ) {
    return "border-l-danger bg-red-50";
  }
  if (["OFFLINE", "DUPLICATE_SESSION", "RELOAD_OR_CLOSE"].includes(type)) {
    return "border-l-warn bg-amber-50";
  }
  if (["LOGIN", "EXAM_STARTED", "SUBMITTED"].includes(type)) {
    return "border-l-ok bg-emerald-50";
  }
  return "border-l-slate-300 bg-slate-50";
}

export default function LiveMonitorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityItem[]>([]);
  const [examTitle, setExamTitle] = useState("");
  const [examStatus, setExamStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);
  const [sideTab, setSideTab] = useState<"activity" | "student">("activity");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;

    (async () => {
      const probe = await fetch("/api/admin/exams");
      if (probe.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (cancelled) return;

      es = new EventSource(`/api/admin/live/${id}`);
      es.onopen = () => {
        setLive(true);
        setError("");
      };
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === "snapshot") {
            setExamTitle(data.exam.title);
            setExamStatus(data.exam.status);
            setStudents(data.students);
            setActivityLog(data.activityLog ?? []);
            setLive(true);
            setError("");
          }
        } catch {
          /* ignore */
        }
      };
      es.onerror = () => {
        setLive(false);
        setError("Live connection interrupted — retrying…");
      };
    })();

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [id, router]);

  const stats = useMemo(() => {
    const counts = {
      total: students.length,
      waiting: 0,
      in_progress: 0,
      offline: 0,
      submitted: 0,
      auto_submitted: 0,
      strikes: 0,
    };
    for (const s of students) {
      if (s.displayStatus in counts) {
        counts[s.displayStatus as keyof typeof counts] += 1;
      }
      counts.strikes += s.strikeCount;
    }
    return counts;
  }, [students]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      if (filter !== "all" && s.displayStatus !== filter) return false;
      if (!q) return true;
      return (
        s.studentName.toLowerCase().includes(q) ||
        s.studentEmail.toLowerCase().includes(q)
      );
    });
  }, [students, filter, query]);

  const selectedStudent = students.find((s) => s.id === selected) ?? null;

  async function loadTimeline(attemptId: string) {
    setSelected(attemptId);
    setSideTab("student");
    const res = await fetch(`/api/admin/attempts/${attemptId}`);
    const data = await res.json();
    setTimeline(data.attempt?.violations ?? []);
  }

  async function action(
    attemptId: string,
    act: "add_time" | "force_submit" | "reset"
  ) {
    if (
      act === "reset" &&
      !confirm(
        "Reset this attempt? All answers and violations will be cleared."
      )
    ) {
      return;
    }
    if (act === "force_submit" && !confirm("Force-submit this student?")) {
      return;
    }
    await fetch(`/api/admin/attempts/${attemptId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: act,
        minutes: act === "add_time" ? 5 : undefined,
      }),
    });
    if (selected === attemptId) await loadTimeline(attemptId);
  }

  const filters: { id: StatusFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: stats.total },
    { id: "in_progress", label: "Active", count: stats.in_progress },
    { id: "waiting", label: "Waiting", count: stats.waiting },
    { id: "offline", label: "Offline", count: stats.offline },
    { id: "submitted", label: "Submitted", count: stats.submitted },
    {
      id: "auto_submitted",
      label: "Auto",
      count: stats.auto_submitted,
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/admin/exams/${id}`}
            className="text-sm text-accent underline"
          >
            ← Manage exam
          </Link>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold">
            Live monitor
          </h1>
          <p className="text-muted">
            {examTitle || "…"} ·{" "}
            <span className="font-medium text-ink">{examStatus || "…"}</span>
          </p>
        </div>
        <div
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
            live
              ? "bg-emerald-100 text-ok"
              : "bg-amber-100 text-warn"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-ok" : "bg-warn"}`}
          />
          {live ? "Live" : "Reconnecting"}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-warn">{error}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Students" value={stats.total} />
        <StatCard label="Active" value={stats.in_progress} tone="ok" />
        <StatCard label="Waiting" value={stats.waiting} />
        <StatCard label="Offline" value={stats.offline} tone="warn" />
        <StatCard
          label="Done"
          value={stats.submitted + stats.auto_submitted}
          tone="accent"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  filter === f.id
                    ? "bg-accent text-white"
                    : "bg-slate-100 text-muted hover:bg-slate-200"
                }`}
                onClick={() => setFilter(f.id)}
              >
                {f.label} {f.count}
              </button>
            ))}
            <input
              className="input ml-auto max-w-[220px] !py-1.5 text-sm"
              placeholder="Search name or email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Time</th>
                  <th>Strikes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const pct =
                    s.total > 0
                      ? Math.round((s.answered / s.total) * 100)
                      : 0;
                  return (
                    <tr
                      key={s.id}
                      className={
                        selected === s.id
                          ? "bg-teal-50"
                          : s.displayStatus === "offline"
                            ? "bg-amber-50/60"
                            : undefined
                      }
                    >
                      <td>
                        <button
                          type="button"
                          className="text-left font-medium text-accent underline"
                          onClick={() => void loadTimeline(s.id)}
                        >
                          {s.studentName}
                        </button>
                        <div className="text-xs text-muted">
                          {s.studentEmail}
                        </div>
                        {s.lastViolation && (
                          <div className="mt-0.5 text-[11px] text-muted">
                            Last: {s.lastViolation.type}
                          </div>
                        )}
                      </td>
                      <td>
                        <StatusPill status={s.displayStatus} />
                      </td>
                      <td className="min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-accent transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-xs tabular-nums text-muted">
                            {s.answered}/{s.total}
                          </span>
                        </div>
                      </td>
                      <td className="font-[family-name:var(--font-mono)] text-sm tabular-nums">
                        {fmtRemaining(s.remainingMs)}
                      </td>
                      <td>
                        <span
                          className={
                            s.strikeCount > 0
                              ? "font-semibold text-danger"
                              : "text-muted"
                          }
                        >
                          {s.strikeCount}
                        </span>
                      </td>
                      <td className="space-x-1 whitespace-nowrap">
                        <button
                          type="button"
                          className="btn btn-secondary !px-2 !py-1 text-xs"
                          onClick={() => void action(s.id, "add_time")}
                          title="Add 5 minutes"
                        >
                          +5m
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary !px-2 !py-1 text-xs"
                          onClick={() => void action(s.id, "force_submit")}
                        >
                          Force
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger !px-2 !py-1 text-xs"
                          onClick={() => void action(s.id, "reset")}
                        >
                          Reset
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-muted">
                      No students match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="card flex max-h-[78vh] flex-col">
          <div className="flex gap-2 border-b border-border pb-2">
            <button
              type="button"
              className={`btn !px-3 !py-1 text-xs ${sideTab === "activity" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setSideTab("activity")}
            >
              Activity
            </button>
            <button
              type="button"
              className={`btn !px-3 !py-1 text-xs ${sideTab === "student" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setSideTab("student")}
            >
              Student
            </button>
          </div>

          {sideTab === "activity" ? (
            <>
              <h2 className="mt-3 font-semibold">Everyone</h2>
              <p className="text-xs text-muted">
                Newest events across all students. Click a row to inspect.
              </p>
              {activityLog.length === 0 && (
                <p className="mt-3 text-sm text-muted">No activity yet.</p>
              )}
              <ol className="mt-3 flex-1 space-y-2 overflow-y-auto text-sm">
                {activityLog.map((ev) => (
                  <li key={ev.id}>
                    <button
                      type="button"
                      className={`w-full rounded-r-md border-l-4 px-2 py-2 text-left ${eventTone(ev.type)}`}
                      onClick={() => void loadTimeline(ev.attemptId)}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold">{ev.type}</span>
                        <span className="shrink-0 text-[11px] text-muted">
                          {fmtTime(ev.createdAt)}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-accent">
                        {ev.studentName}
                      </div>
                      {ev.detail && (
                        <div className="truncate text-[11px] text-muted">
                          {ev.detail}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <h2 className="mt-3 font-semibold">
                {selectedStudent?.studentName ?? "Student timeline"}
              </h2>
              {selectedStudent && (
                <p className="text-xs text-muted">
                  {selectedStudent.studentEmail} ·{" "}
                  <StatusPill status={selectedStudent.displayStatus} /> ·{" "}
                  {selectedStudent.answered}/{selectedStudent.total} ·{" "}
                  {selectedStudent.strikeCount} strikes
                </p>
              )}
              {!selected && (
                <p className="mt-2 text-sm text-muted">
                  Select a student or activity row.
                </p>
              )}
              {selected && timeline.length === 0 && (
                <p className="mt-2 text-sm text-muted">No events recorded.</p>
              )}
              <ol className="mt-3 flex-1 space-y-2 overflow-y-auto text-sm">
                {timeline.map((v) => (
                  <li
                    key={v.id}
                    className={`rounded-r-md border-l-4 px-2 py-2 ${eventTone(v.type)}`}
                  >
                    <div className="font-semibold">{v.type}</div>
                    <div className="text-[11px] text-muted">
                      {fmtTime(v.createdAt)}
                    </div>
                    {v.detail && (
                      <div className="text-xs text-muted">{v.detail}</div>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "accent";
}) {
  const color =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "accent"
          ? "text-accent"
          : "text-ink";
  return (
    <div className="card !py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>
        {value}
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    waiting: "bg-slate-100 text-muted",
    in_progress: "bg-emerald-100 text-ok",
    offline: "bg-amber-100 text-warn",
    submitted: "bg-sky-100 text-sky-800",
    auto_submitted: "bg-red-100 text-danger",
  };
  return (
    <span
      className={`inline-rounded rounded px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-slate-100"}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
