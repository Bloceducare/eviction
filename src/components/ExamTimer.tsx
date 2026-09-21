"use client";

import { useEffect, useState } from "react";

type Props = {
  deadlineAt: number;
  serverOffset: number;
  onExpire: () => void;
};

function format(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ExamTimer({ deadlineAt, serverOffset, onExpire }: Props) {
  const [remaining, setRemaining] = useState(
    () => deadlineAt - (Date.now() + serverOffset)
  );
  const expired = remaining <= 0;

  useEffect(() => {
    const tick = () => {
      const r = deadlineAt - (Date.now() + serverOffset);
      setRemaining(r);
      if (r <= 0) onExpire();
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadlineAt, serverOffset, onExpire]);

  const urgent = remaining < 5 * 60_000;

  return (
    <div
      className={`rounded-lg px-3 py-1.5 font-[family-name:var(--font-mono)] text-lg font-semibold tabular-nums ${
        urgent ? "bg-red-100 text-danger" : "bg-slate-100 text-ink"
      }`}
      aria-live="polite"
      aria-label="Time remaining"
    >
      {expired ? "00:00" : format(remaining)}
    </div>
  );
}
