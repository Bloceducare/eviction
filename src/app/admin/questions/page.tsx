"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Question = {
  id: string;
  section: string;
  difficulty: string;
  type: string;
  text: string;
  points: number;
};

export default function QuestionsPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [q, setQ] = useState("");
  const [section, setSection] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [importText, setImportText] = useState("");
  const [preview, setPreview] = useState<string>("");
  const [msg, setMsg] = useState("");

  async function load() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (section) params.set("section", section);
    if (difficulty) params.set("difficulty", difficulty);
    const res = await fetch(`/api/admin/questions?${params}`);
    if (res.status === 401) {
      router.replace("/admin/login");
      return;
    }
    const data = await res.json();
    setQuestions(data.questions ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function doImport(asPreview: boolean) {
    setMsg("");
    setPreview("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setMsg("Invalid JSON");
      return;
    }

    const payload =
      parsed &&
      typeof parsed === "object" &&
      "questions" in (parsed as object)
        ? {
            questions: (parsed as { questions: unknown[] }).questions,
            pointsByDifficulty: (parsed as { meta?: { pointsByDifficulty?: Record<string, number> } })
              .meta?.pointsByDifficulty,
            openEndedPoints: (parsed as { meta?: { openEndedPoints?: number } })
              .meta?.openEndedPoints,
            preview: asPreview,
          }
        : { questions: parsed, preview: asPreview };

    const res = await fetch("/api/admin/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Import failed");
      return;
    }
    if (asPreview) {
      setPreview(
        `Preview OK: ${data.count} questions. Sample: ${JSON.stringify(data.sample, null, 2)}`
      );
    } else {
      setMsg(`Imported ${data.upserted} questions`);
      await load();
    }
  }

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
        Question bank
      </h1>
      <p className="text-muted">{questions.length} questions shown</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          className="input max-w-[160px]"
          placeholder="Section"
          value={section}
          onChange={(e) => setSection(e.target.value)}
        />
        <input
          className="input max-w-[120px]"
          placeholder="Difficulty"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
        />
        <button type="button" className="btn btn-secondary" onClick={() => void load()}>
          Filter
        </button>
      </div>

      <div className="card mt-6 overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Section</th>
              <th>Diff</th>
              <th>Type</th>
              <th>Pts</th>
              <th>Question</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((question) => (
              <tr key={question.id}>
                <td className="font-[family-name:var(--font-mono)] text-xs">
                  {question.id}
                </td>
                <td>{question.section}</td>
                <td>{question.difficulty}</td>
                <td>{question.type}</td>
                <td>{question.points}</td>
                <td className="max-w-md truncate">{question.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card mt-8">
        <h2 className="text-lg font-semibold">Import JSON</h2>
        <p className="mt-1 text-sm text-muted">
          Paste the full bank file (with meta + questions) or a questions array.
          Preview before saving.
        </p>
        <textarea
          className="input mt-3 min-h-[160px] font-[family-name:var(--font-mono)] text-xs"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder='{"meta":{...},"questions":[...]}'
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void doImport(true)}
          >
            Preview
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void doImport(false)}
          >
            Import & save
          </button>
        </div>
        {preview && (
          <pre className="mt-3 overflow-x-auto rounded bg-slate-50 p-3 text-xs">
            {preview}
          </pre>
        )}
        {msg && <p className="mt-2 text-sm text-ok">{msg}</p>}
      </section>
    </div>
  );
}
