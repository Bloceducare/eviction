"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav() {
  const pathname = usePathname();
  if (pathname === "/admin/login") return null;

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/admin"
          className="font-[family-name:var(--font-display)] text-lg font-semibold"
        >
          Web3Bridge Admin
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm">
          <Link href="/admin" className="text-muted hover:text-ink">
            Exams
          </Link>
          <Link href="/admin/questions" className="text-muted hover:text-ink">
            Question banks
          </Link>
          <button
            type="button"
            className="text-muted hover:text-ink"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/admin/login";
            }}
          >
            Log out
          </button>
        </nav>
      </div>
    </header>
  );
}
