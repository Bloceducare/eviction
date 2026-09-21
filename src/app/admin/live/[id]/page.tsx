"use client";

import { useEffect, useState } from "react";
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
  const [sideTab, setSideTab] = useState<"activity" | "student">("activity");

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
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === "snapshot") {
            setExamTitle(data.exam.title);
            setExamStatus(data.exam.status);
            setStudents(data.students);
            setActivityLog(data.activityLog ?? []);
            setError("");
          }
        } catch {
          /* ignore */
        }
      };
      es.onerror = () => setError("Live connection interrupted — retrying…");
    })();

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [id, router]);

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

  return (
    <div>
      <Link href={`/admin/exams/${id}`} className="text-sm text-accent underline">
        ← Manage exam
      </Link>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold">
        Live monitor
      </h1>
      <p className="text-muted">
        {examTitle} · status {examStatus || "…"}
      </p>
      {error && <p className="mt-2 text-sm text-warn">{error}</p>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Time left</th>
                <th>Strikes</th>
                <th>Last violation</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr
                  key={s.id}
                  className={selected === s.id ? "bg-teal-50" : undefined}
                >
                  <td>
                    <button
                      type="button"
                      className="text-left font-medium text-accent underline"
                      onClick={() => void loadTimeline(s.id)}
                    >
                      {s.studentName}
                    </button>
                    <div className="text-xs text-muted">{s.studentEmail}</div>
                  </td>
                  <td>
                    <StatusPill status={s.displayStatus} />
                  </td>
                  <td>
                    {s.answered}/{s.total}
                  </td>
                  <td className="font-[family-name:var(--font-mono)]">
                    {fmtRemaining(s.remainingMs)}
                  </td>
                  <td>{s.strikeCount}</td>
                  <td className="text-xs">
                    {s.lastViolation ? `${s.lastViolation.type}` : "—"}
                  </td>
                  <td className="space-x-1 whitespace-nowrap">
                    <button
                      type="button"
                      className="btn btn-secondary !px-2 !py-1 text-xs"
                      onClick={() => void action(s.id, "add_time")}
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
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-muted">
                    No students yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <aside className="card flex max-h-[75vh] flex-col">
          <div className="flex gap-2 border-b border-border pb-2">
            <button
              type="button"
              className={`btn !px-3 !py-1 text-xs ${sideTab === "activity" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setSideTab("activity")}
            >
              Everyone
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
              <h2 className="mt-3 font-semibold">Activity log</h2>
              <p className="text-xs text-muted">
                Live feed of logins, starts, violations, and submissions.
              </p>
              {activityLog.length === 0 && (
                <p className="mt-3 text-sm text-muted">No activity yet.</p>
              )}
              <ol className="mt-3 flex-1 space-y-2 overflow-y-auto text-sm">
                {activityLog.map((ev) => (
                  <li
                    key={ev.id}
                    className="cursor-pointer border-b border-border pb-2 hover:bg-slate-50"
                    onClick={() => void loadTimeline(ev.attemptId)}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{ev.type}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {fmtTime(ev.createdAt)}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-accent">
                      {ev.studentName}
                    </div>
                    {ev.detail && (
                      <div className="text-xs text-muted">{ev.detail}</div>
                    )}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <h2 className="mt-3 font-semibold">Student timeline</h2>
              {!selected && (
                <p className="mt-2 text-sm text-muted">
                  Select a student (or an activity row) to view their events.
                </p>
              )}
              {selected && timeline.length === 0 && (
                <p className="mt-2 text-sm text-muted">No events recorded.</p>
              )}
              <ol className="mt-3 flex-1 space-y-2 overflow-y-auto text-sm">
                {timeline.map((v) => (
                  <li key={v.id} className="border-b border-border pb-2">
                    <div className="font-medium">{v.type}</div>
                    <div className="text-xs text-muted">
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
      className={`rounded px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-slate-100"}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
