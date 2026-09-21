"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

type Question = {
  id: string;
  key: string | null;
  section: string;
  difficulty: string;
  type: "mcq" | "multi" | "open" | string;
  text: string;
  code: string | null;
  options: string[] | null;
  answer: number | number[] | null;
  explanation: string | null;
  rubric: string[] | null;
  points: number;
};

type Bank = {
  id: string;
  name: string;
  description: string | null;
  _count: { questions: number };
};

const emptyDraft = (): Question => ({
  id: "",
  key: "",
  section: "fundamentals",
  difficulty: "easy",
  type: "mcq",
  text: "",
  code: null,
  options: ["", "", "", ""],
  answer: 0,
  explanation: "",
  rubric: null,
  points: 1,
});

export default function BankDetailPage() {
  const { id: bankId } = useParams<{ id: string }>();
  const router = useRouter();
  const [bank, setBank] = useState<Bank | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [q, setQ] = useState("");
  const [section, setSection] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [importText, setImportText] = useState("");
  const [preview, setPreview] = useState("");
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<Question | null>(null);
  const [saving, setSaving] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [replaceOnImport, setReplaceOnImport] = useState(false);

  async function loadBank() {
    const res = await fetch(`/api/admin/banks/${bankId}`);
    if (res.status === 401) {
      router.replace("/admin/login");
      return;
    }
    if (!res.ok) {
      setMsg("Bank not found");
      return;
    }
    const data = await res.json();
    setBank(data.bank);
  }

  async function loadQuestions() {
    const params = new URLSearchParams({ bankId });
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
    loadBank();
    loadQuestions();
  }, [bankId]);

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
            bankId,
            questions: (parsed as { questions: unknown[] }).questions,
            pointsByDifficulty: (
              parsed as {
                meta?: { pointsByDifficulty?: Record<string, number> };
              }
            ).meta?.pointsByDifficulty,
            openEndedPoints: (
              parsed as { meta?: { openEndedPoints?: number } }
            ).meta?.openEndedPoints,
            preview: asPreview,
            replace: replaceOnImport && !asPreview,
          }
        : {
            bankId,
            questions: parsed,
            preview: asPreview,
            replace: replaceOnImport && !asPreview,
          };

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
      setMsg(`Imported ${data.upserted} questions (bank total ${data.total})`);
      await loadBank();
      await loadQuestions();
    }
  }

  async function openEdit(id: string) {
    const res = await fetch(`/api/admin/questions/${id}`);
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Failed to load question");
      return;
    }
    setIsNew(false);
    setEditing(data.question);
  }

  function openCreate() {
    setIsNew(true);
    setEditing(emptyDraft());
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    setMsg("");
    try {
      if (isNew) {
        const res = await fetch("/api/admin/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bankId,
            questions: [
              {
                id: editing.key || undefined,
                key: editing.key || undefined,
                section: editing.section,
                difficulty: editing.difficulty,
                type: editing.type,
                question: editing.text,
                code: editing.code || undefined,
                options:
                  editing.type === "open"
                    ? undefined
                    : (editing.options ?? []).filter(Boolean),
                answer:
                  editing.type === "open"
                    ? undefined
                    : (editing.answer ?? undefined),
                explanation: editing.explanation || undefined,
                rubric:
                  editing.type === "open"
                    ? editing.rubric ?? undefined
                    : undefined,
                points: editing.points,
              },
            ],
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMsg(data.error ?? "Create failed");
          return;
        }
      } else {
        const res = await fetch(`/api/admin/questions/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: editing.key,
            section: editing.section,
            difficulty: editing.difficulty,
            type: editing.type,
            text: editing.text,
            code: editing.code,
            options: editing.type === "open" ? null : editing.options,
            answer: editing.type === "open" ? null : editing.answer,
            explanation: editing.explanation,
            rubric: editing.type === "open" ? editing.rubric : null,
            points: editing.points,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMsg(data.error ?? "Save failed");
          return;
        }
      }
      setEditing(null);
      setMsg(isNew ? "Question created" : "Question saved");
      await loadBank();
      await loadQuestions();
    } finally {
      setSaving(false);
    }
  }

  async function deleteQuestion(id: string) {
    if (!confirm("Delete this question?")) return;
    await fetch(`/api/admin/questions/${id}`, { method: "DELETE" });
    setEditing(null);
    setMsg("Deleted");
    await loadBank();
    await loadQuestions();
  }

  if (!bank) return <p className="text-muted">Loading bank…</p>;

  return (
    <div>
      <Link href="/admin/questions" className="text-sm text-accent underline">
        ← All banks
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            {bank.name}
          </h1>
          <p className="text-muted">
            {bank._count.questions} questions
            {bank.description ? ` · ${bank.description}` : ""}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          New question
        </button>
      </div>

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
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void loadQuestions()}
        >
          Filter
        </button>
      </div>

      {msg && (
        <p className="mt-3 text-sm text-ok" role="status">
          {msg}
        </p>
      )}

      <div className="card mt-6 overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Section</th>
              <th>Diff</th>
              <th>Type</th>
              <th>Pts</th>
              <th>Question</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {questions.map((question) => (
              <tr key={question.id}>
                <td className="font-[family-name:var(--font-mono)] text-xs">
                  {question.key ?? "—"}
                </td>
                <td>{question.section}</td>
                <td>{question.difficulty}</td>
                <td>{question.type}</td>
                <td>{question.points}</td>
                <td className="max-w-md truncate">{question.text}</td>
                <td className="whitespace-nowrap text-right">
                  <button
                    type="button"
                    className="text-accent underline"
                    onClick={() => void openEdit(question.id)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card mt-8">
        <h2 className="text-lg font-semibold">Import JSON into this bank</h2>
        <p className="mt-1 text-sm text-muted">
          Upload or paste a bank file / questions array. Scales to 1k+ questions.
        </p>
        <input
          type="file"
          accept="application/json,.json"
          className="mt-3 block text-sm"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setImportText(await file.text());
            setMsg(`Loaded ${file.name}`);
          }}
        />
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={replaceOnImport}
            onChange={(e) => setReplaceOnImport(e.target.checked)}
          />
          Replace all existing questions in this bank
        </label>
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
      </section>

      {editing && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="card my-8 w-full max-w-2xl space-y-3">
            <h2 className="text-lg font-semibold">
              {isNew ? "New question" : `Edit ${editing.key ?? editing.id}`}
            </h2>
            <div>
              <label className="text-xs font-medium">Key (optional)</label>
              <input
                className="input font-[family-name:var(--font-mono)]"
                value={editing.key ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, key: e.target.value })
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-xs font-medium">Section</label>
                <input
                  className="input"
                  value={editing.section}
                  onChange={(e) =>
                    setEditing({ ...editing, section: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-medium">Difficulty</label>
                <select
                  className="input"
                  value={editing.difficulty}
                  onChange={(e) =>
                    setEditing({ ...editing, difficulty: e.target.value })
                  }
                >
                  <option value="easy">easy</option>
                  <option value="medium">medium</option>
                  <option value="hard">hard</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Type</label>
                <select
                  className="input"
                  value={editing.type}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      type: e.target.value as Question["type"],
                    })
                  }
                >
                  <option value="mcq">mcq</option>
                  <option value="multi">multi</option>
                  <option value="open">open</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Question text</label>
              <textarea
                className="input min-h-[80px]"
                value={editing.text}
                onChange={(e) =>
                  setEditing({ ...editing, text: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs font-medium">Code (optional)</label>
              <textarea
                className="input min-h-[80px] font-[family-name:var(--font-mono)] text-xs"
                value={editing.code ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, code: e.target.value || null })
                }
              />
            </div>
            {editing.type !== "open" && (
              <div>
                <label className="text-xs font-medium">
                  Options (one per line)
                </label>
                <textarea
                  className="input min-h-[100px]"
                  value={(editing.options ?? []).join("\n")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      options: e.target.value.split("\n"),
                    })
                  }
                />
                <label className="mt-2 block text-xs font-medium">
                  Answer{" "}
                  {editing.type === "mcq"
                    ? "(0-based index)"
                    : "(comma-separated indices)"}
                </label>
                <input
                  className="input"
                  value={
                    Array.isArray(editing.answer)
                      ? editing.answer.join(",")
                      : (editing.answer ?? "")
                  }
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (editing.type === "multi") {
                      setEditing({
                        ...editing,
                        answer: raw
                          ? raw.split(",").map((n) => Number(n.trim()))
                          : [],
                      });
                    } else {
                      setEditing({
                        ...editing,
                        answer: raw === "" ? 0 : Number(raw),
                      });
                    }
                  }}
                />
              </div>
            )}
            {editing.type === "open" && (
              <div>
                <label className="text-xs font-medium">
                  Rubric (one criterion per line)
                </label>
                <textarea
                  className="input min-h-[100px]"
                  value={(editing.rubric ?? []).join("\n")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      rubric: e.target.value.split("\n").filter(Boolean),
                    })
                  }
                />
              </div>
            )}
            <div>
              <label className="text-xs font-medium">Explanation</label>
              <textarea
                className="input min-h-[60px]"
                value={editing.explanation ?? ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    explanation: e.target.value || null,
                  })
                }
              />
            </div>
            <div>
              <label className="text-xs font-medium">Points</label>
              <input
                className="input max-w-[120px]"
                type="number"
                min={1}
                value={editing.points}
                onChange={(e) =>
                  setEditing({ ...editing, points: Number(e.target.value) })
                }
              />
            </div>
            <div className="flex flex-wrap justify-between gap-2 pt-2">
              <div>
                {!isNew && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => void deleteQuestion(editing.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saving}
                  onClick={() => void saveEdit()}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
