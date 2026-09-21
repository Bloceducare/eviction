"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function DonePage() {
  const router = useRouter();
  const [info, setInfo] = useState<{
    title: string;
    status: string;
    releaseResults: boolean;
    totalScore: number | null;
    autoScore: number | null;
    manualScore: number | null;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/exam/status");
      if (res.status === 401) {
        router.replace("/");
        return;
      }
      const data = await res.json();
      setInfo({
        title: data.exam?.title ?? "Exam",
        status: data.attempt?.status ?? "SUBMITTED",
        releaseResults: !!data.exam?.releaseResults,
        totalScore: data.attempt?.totalScore ?? null,
        autoScore: data.attempt?.autoScore ?? null,
        manualScore: data.attempt?.manualScore ?? null,
      });
    })();
  }, [router]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center p-6 text-center">
      <div className="card w-full">
        <p className="text-sm font-medium text-ok">Submitted</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold">
          {info?.title ?? "Exam"}
        </h1>
        <p className="mt-3 text-muted">
          Your attempt is{" "}
          <span className="font-medium text-ink">
            {info?.status === "AUTO_SUBMITTED"
              ? "auto-submitted"
              : "submitted"}
          </span>
          . You may leave this page.
        </p>
        {info?.releaseResults && info.totalScore != null && (
          <div className="mt-6 rounded-lg bg-slate-50 p-4 text-left text-sm">
            <p>
              Auto score: <strong>{info.autoScore}</strong>
            </p>
            <p>
              Manual score: <strong>{info.manualScore ?? 0}</strong>
            </p>
            <p className="mt-1 text-base">
              Total: <strong>{info.totalScore}</strong>
            </p>
          </div>
        )}
        {!info?.releaseResults && (
          <p className="mt-4 text-sm text-muted">
            Scores and explanations are released by the instructor when ready.
          </p>
        )}
        <Link href="/" className="btn btn-secondary mt-6 inline-flex">
          Back to login
        </Link>
      </div>
    </main>
  );
}
