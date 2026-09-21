"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Bank = {
  id: string;
  name: string;
  description: string | null;
  _count: { questions: number };
};

export default function BanksPage() {
  const router = useRouter();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/admin/banks");
    if (res.status === 401) {
      router.replace("/admin/login");
      return;
    }
    const data = await res.json();
    setBanks(data.banks ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createBank(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/banks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to create bank");
      return;
    }
    setName("");
    setDescription("");
    router.push(`/admin/banks/${data.bank.id}`);
  }

  async function deleteBank(id: string, bankName: string) {
    if (
      !confirm(
        `Delete bank "${bankName}" and all of its questions? This cannot be undone.`
      )
    ) {
      return;
    }
    await fetch(`/api/admin/banks/${id}`, { method: "DELETE" });
    await load();
  }

  if (loading) return <p className="text-muted">Loading…</p>;

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
        Question banks
      </h1>
      <p className="mt-1 text-muted">
        Create large banks (hundreds or thousands of questions). Each exam picks
        a bank and how many questions to draw — every student gets a random
        subset in random order.
      </p>

      <form
        onSubmit={createBank}
        className="card mt-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
      >
        <input
          className="input"
          placeholder="Bank name (e.g. Cohort XIII Part 1)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="input"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button type="submit" className="btn btn-primary">
          Create bank
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
              <th>Name</th>
              <th>Questions</th>
              <th>Description</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {banks.map((b) => (
              <tr key={b.id}>
                <td className="font-medium">{b.name}</td>
                <td>{b._count.questions}</td>
                <td className="max-w-sm truncate text-muted">
                  {b.description ?? "—"}
                </td>
                <td className="space-x-3 whitespace-nowrap text-right">
                  <Link
                    href={`/admin/banks/${b.id}`}
                    className="text-accent underline"
                  >
                    Open
                  </Link>
                  <button
                    type="button"
                    className="text-danger underline"
                    onClick={() => void deleteBank(b.id, b.name)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {banks.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted">
                  No banks yet. Create one above, then import or add questions.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
