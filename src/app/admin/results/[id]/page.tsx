"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Row = {
  attemptId: string;
  studentName: string;
  studentEmail: string;
  status: string;
  autoScore: number | null;
  manualScore: number | null;
  totalScore: number | null;
  maxPoints: number;
  percent: number;
  strikes: number;
  submittedAt: string | null;
};

type SortKey = keyof Row;

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [releaseResults, setReleaseResults] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("totalScore");
  const [asc, setAsc] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch(`/api/admin/results/${id}`);
    if (res.status === 401) {
      router.replace("/admin/login");
      return;
    }
    const data = await res.json();
    setRows(data.rows ?? []);
    setReleaseResults(!!data.exam?.config?.releaseResults);
  }

  useEffect(() => {
    load();
  }, [id]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return asc ? -1 : 1;
      if (av > bv) return asc ? 1 : -1;
      return 0;
    });
    return copy;
  }, [rows, sortKey, asc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(false);
    }
  }

  async function toggleRelease() {
    const next = !releaseResults;
    const res = await fetch(`/api/admin/exams/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { releaseResults: next } }),
    });
    if (res.ok) {
      setReleaseResults(next);
      setMsg(next ? "Results released to students" : "Results hidden");
    }
  }

  return (
    <div>
      <Link href={`/admin/exams/${id}`} className="text-sm text-accent underline">
        ← Manage exam
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Results
        </h1>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={toggleRelease}>
            {releaseResults ? "Hide results" : "Release results"}
          </button>
          <a
            className="btn btn-primary"
            href={`/api/admin/results/${id}?format=csv`}
          >
            Export CSV
          </a>
        </div>
      </div>
      {msg && <p className="mt-2 text-sm text-ok">{msg}</p>}

      <div className="card mt-6 overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              {(
                [
                  ["studentName", "Name"],
                  ["status", "Status"],
                  ["autoScore", "Auto"],
                  ["manualScore", "Manual"],
                  ["totalScore", "Total"],
                  ["percent", "%"],
                  ["strikes", "Strikes"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th key={key}>
                  <button
                    type="button"
                    className="font-semibold"
                    onClick={() => toggleSort(key)}
                  >
                    {label}
                    {sortKey === key ? (asc ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.attemptId}>
                <td>
                  <div className="font-medium">{r.studentName}</div>
                  <div className="text-xs text-muted">{r.studentEmail}</div>
                </td>
                <td>{r.status}</td>
                <td>{r.autoScore ?? "—"}</td>
                <td>{r.manualScore ?? "—"}</td>
                <td>
                  {r.totalScore ?? "—"} / {r.maxPoints}
                </td>
                <td>{r.percent}%</td>
                <td>{r.strikes}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="text-muted">
                  No attempts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
