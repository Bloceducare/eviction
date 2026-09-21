"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CodeBlock } from "@/components/CodeBlock";
import { ExamTimer } from "@/components/ExamTimer";
import { ProctorGuard } from "@/components/ProctorGuard";
import type { SanitizedQuestion } from "@/lib/sanitize";

type LoadPayload = {
  questions: SanitizedQuestion[];
  answers: Record<string, unknown>;
  flagged: string[];
  startedAt: string | null;
  deadlineAt: string | null;
  status: string;
  strikeCount: number;
  serverNow: number;
};

export default function TakeExamPage() {
  const router = useRouter();
  const [data, setData] = useState<LoadPayload | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "offline">(
    "idle"
  );
  const [serverOffset, setServerOffset] = useState(0);
  const [maxViolations, setMaxViolations] = useState(3);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<
    { questionId: string; value: unknown; flagged?: boolean }[]
  >([]);
  const expiredOnce = useRef(false);

  const load = useCallback(async () => {
    const [qRes, sRes] = await Promise.all([
      fetch("/api/attempt/questions"),
      fetch("/api/exam/status"),
    ]);
    if (qRes.status === 401 || sRes.status === 401) {
      router.replace("/");
      return;
    }
    const qData = await qRes.json();
    const sData = await sRes.json();
    if (!qRes.ok) {
      if (qData.error) router.replace("/exam/done");
      return;
    }
    if (qData.status !== "IN_PROGRESS") {
      router.replace("/exam/done");
      return;
    }
    if (!qData.startedAt) {
      router.replace("/exam/lobby");
      return;
    }
    setData(qData);
    setAnswers(qData.answers ?? {});
    setFlagged(new Set(qData.flagged ?? []));
    setServerOffset(qData.serverNow - Date.now());
    if (sData.exam?.maxViolations) setMaxViolations(sData.exam.maxViolations);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  // Sync server time every 30s
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/attempt/heartbeat", { method: "POST" });
        const body = await res.json();
        if (body.serverNow) setServerOffset(body.serverNow - Date.now());
        if (body.status && body.status !== "IN_PROGRESS") {
          router.replace("/exam/done");
        }
      } catch {
        setSaveState("offline");
      }
    }, 10_000);
    return () => clearInterval(id);
  }, [router]);

  // Heartbeat every 10s is above; also sync clock at 30s via status
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/exam/status");
        const body = await res.json();
        if (body.serverNow) setServerOffset(body.serverNow - Date.now());
      } catch {
        /* ignore */
      }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const flushQueue = useCallback(async () => {
    if (queue.current.length === 0) return;
    const items = [...queue.current];
    queue.current = [];
    setSaveState("saving");
    try {
      for (const item of items) {
        const res = await fetch("/api/attempt/answer", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
        if (!res.ok) {
          queue.current.push(item);
          setSaveState("offline");
          return;
        }
      }
      setSaveState("saved");
    } catch {
      queue.current.push(...items);
      setSaveState("offline");
    }
  }, []);

  const scheduleSave = useCallback(
    (questionId: string, value: unknown, isFlagged?: boolean) => {
      queue.current = queue.current.filter((x) => x.questionId !== questionId);
      queue.current.push({
        questionId,
        value,
        flagged: isFlagged,
      });
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void flushQueue();
      }, 1000);
    },
    [flushQueue]
  );

  const doSubmit = useCallback(
    async (reason: "manual" | "timer" | "strikes" = "manual") => {
      if (submitting) return;
      setSubmitting(true);
      await flushQueue();
      try {
        await fetch("/api/attempt/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
      } finally {
        router.replace("/exam/done");
      }
    },
    [flushQueue, router, submitting]
  );

  const onExpire = useCallback(() => {
    if (expiredOnce.current) return;
    expiredOnce.current = true;
    void doSubmit("timer");
  }, [doSubmit]);

  const questions = data?.questions ?? [];
  const current = questions[index];

  const navState = useMemo(() => {
    return questions.map((q) => {
      const answered =
        answers[q.id] !== undefined &&
        answers[q.id] !== null &&
        answers[q.id] !== "" &&
        !(Array.isArray(answers[q.id]) && (answers[q.id] as unknown[]).length === 0);
      return {
        id: q.id,
        answered,
        flagged: flagged.has(q.id),
      };
    });
  }, [questions, answers, flagged]);

  function setAnswer(value: unknown) {
    if (!current) return;
    setAnswers((prev) => ({ ...prev, [current.id]: value }));
    scheduleSave(current.id, value, flagged.has(current.id));
  }

  function toggleFlag() {
    if (!current) return;
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(current.id)) next.delete(current.id);
      else next.add(current.id);
      scheduleSave(current.id, answers[current.id] ?? null, next.has(current.id));
      return next;
    });
  }

  if (!data || !current || !data.deadlineAt) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-muted">Loading exam…</p>
      </main>
    );
  }

  const deadlineMs = new Date(data.deadlineAt).getTime();

  return (
    <ProctorGuard
      enabled
      maxViolations={maxViolations}
      onAutoSubmit={() => void doSubmit("strikes")}
    >
      {saveState === "offline" && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-warn">
          Offline — reconnecting. Answers will retry automatically.
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="text-sm text-muted">
            Question {index + 1} of {questions.length}
            <span className="ml-3">
              {saveState === "saving" && "Saving…"}
              {saveState === "saved" && "Saved"}
            </span>
          </div>
          <ExamTimer
            deadlineAt={deadlineMs}
            serverOffset={serverOffset}
            onExpire={onExpire}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setConfirmSubmit(true)}
          >
            Submit
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl flex-1 gap-6 p-4 lg:grid-cols-[220px_1fr]">
        <nav
          className="card h-fit max-h-[70vh] overflow-y-auto"
          aria-label="Question navigator"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Navigator
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {navState.map((n, i) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setIndex(i)}
                className={`h-8 rounded text-xs font-medium ${
                  i === index
                    ? "bg-accent text-white"
                    : n.flagged
                      ? "bg-amber-100 text-warn"
                      : n.answered
                        ? "bg-emerald-100 text-ok"
                        : "bg-slate-100 text-muted"
                }`}
                aria-label={`Question ${i + 1}${n.answered ? ", answered" : ""}${n.flagged ? ", flagged" : ""}`}
                aria-current={i === index ? "true" : undefined}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <ul className="mt-3 space-y-1 text-xs text-muted">
            <li>
              <span className="inline-block h-2 w-2 rounded bg-emerald-100" />{" "}
              Answered
            </li>
            <li>
              <span className="inline-block h-2 w-2 rounded bg-amber-100" />{" "}
              Flagged
            </li>
            <li>
              <span className="inline-block h-2 w-2 rounded bg-slate-100" />{" "}
              Unanswered
            </li>
          </ul>
        </nav>

        <section className="card no-select">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="rounded bg-slate-100 px-2 py-0.5">{current.section}</span>
            <span className="rounded bg-slate-100 px-2 py-0.5">
              {current.difficulty}
            </span>
            <span className="rounded bg-slate-100 px-2 py-0.5">
              {current.points} pt{current.points === 1 ? "" : "s"}
            </span>
            <span className="rounded bg-slate-100 px-2 py-0.5 uppercase">
              {current.type}
            </span>
          </div>
          <h2 className="mt-4 text-lg font-medium leading-relaxed">
            {current.text}
          </h2>
          {current.code && (
            <div className="mt-4">
              <CodeBlock code={current.code} />
            </div>
          )}

          <div className="mt-6 space-y-2">
            {current.type === "mcq" &&
              current.options?.map((opt, i) => (
                <label
                  key={i}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                    answers[current.id] === i
                      ? "border-accent bg-teal-50"
                      : "border-border"
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${current.id}`}
                    checked={answers[current.id] === i}
                    onChange={() => setAnswer(i)}
                    className="mt-1"
                  />
                  <span>{opt}</span>
                </label>
              ))}

            {current.type === "multi" &&
              current.options?.map((opt, i) => {
                const selected = Array.isArray(answers[current.id])
                  ? (answers[current.id] as number[])
                  : [];
                const checked = selected.includes(i);
                return (
                  <label
                    key={i}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                      checked ? "border-accent bg-teal-50" : "border-border"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? selected.filter((x) => x !== i)
                          : [...selected, i].sort((a, b) => a - b);
                        setAnswer(next);
                      }}
                      className="mt-1"
                    />
                    <span>{opt}</span>
                  </label>
                );
              })}

            {current.type === "open" && (
              <textarea
                className="input min-h-[180px] font-[family-name:var(--font-mono)] text-sm"
                value={(answers[current.id] as string) ?? ""}
                onChange={(e) => setAnswer(e.target.value)}
                onPaste={(e) => e.preventDefault()}
                placeholder="Type your answer…"
                aria-label="Written answer"
              />
            )}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className={`btn ${flagged.has(current.id) ? "btn-primary" : "btn-secondary"}`}
              onClick={toggleFlag}
            >
              {flagged.has(current.id) ? "Flagged" : "Flag for review"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={index >= questions.length - 1}
              onClick={() =>
                setIndex((i) => Math.min(questions.length - 1, i + 1))
              }
            >
              Next
            </button>
          </div>
        </section>
      </div>

      {confirmSubmit && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="card max-w-md">
            <h3 className="text-lg font-semibold">Submit exam?</h3>
            <p className="mt-2 text-sm text-muted">
              You answered {navState.filter((n) => n.answered).length} of{" "}
              {questions.length} questions. You cannot change answers after
              submitting.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmSubmit(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitting}
                onClick={() => void doSubmit("manual")}
              >
                {submitting ? "Submitting…" : "Confirm submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ProctorGuard>
  );
}
