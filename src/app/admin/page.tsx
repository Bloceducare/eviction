"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Exam = {
  id: string;
  title: string;
  status: string;
  accessCode: string;
  durationMinutes: number;
  _count?: { attempts: number };
};

export default function AdminHomePage() {
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [title, setTitle] = useState("Web3Bridge Web3 Knowledge Assessment");
  const [duration, setDuration] = useState(90);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/admin/exams");
    if (res.status === 401) {
      router.replace("/admin/login");
      return;
    }
    const data = await res.json();
    setExams(data.exams ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createExam(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/exams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, durationMinutes: duration }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed");
      return;
    }
    router.push(`/admin/exams/${data.exam.id}`);
  }

  if (loading) return <p className="text-muted">Loading…</p>;

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
        Exams
      </h1>

      <form onSubmit={createExam} className="card mt-6 grid gap-3 sm:grid-cols-[1fr_120px_auto]">
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Exam title"
          required
        />
        <input
          className="input"
          type="number"
          min={5}
          max={480}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          aria-label="Duration minutes"
        />
        <button type="submit" className="btn btn-primary">
          Create exam
        </button>
        {error && (
          <p className="text-sm text-danger sm:col-span-3" role="alert">
            {error}
          </p>
        )}
      </form>

      <div className="card mt-6 overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Code</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Students</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {exams.map((exam) => (
              <tr key={exam.id}>
                <td>{exam.title}</td>
                <td className="font-[family-name:var(--font-mono)] tracking-wider">
                  {exam.accessCode}
                </td>
                <td>{exam.status}</td>
                <td>{exam.durationMinutes}m</td>
                <td>{exam._count?.attempts ?? 0}</td>
                <td className="space-x-2 whitespace-nowrap text-right">
                  <Link
                    href={`/admin/exams/${exam.id}`}
                    className="text-accent underline"
                  >
                    Manage
                  </Link>
                  <Link
                    href={`/admin/live/${exam.id}`}
                    className="text-accent underline"
                  >
                    Live
                  </Link>
                  <Link
                    href={`/admin/grading/${exam.id}`}
                    className="text-accent underline"
                  >
                    Grade
                  </Link>
                  <Link
                    href={`/admin/results/${exam.id}`}
                    className="text-accent underline"
                  >
                    Results
                  </Link>
                </td>
              </tr>
            ))}
            {exams.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted">
                  No exams yet. Create one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
