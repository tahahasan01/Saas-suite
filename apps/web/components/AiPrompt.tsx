"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Card } from "@/components/ui";

interface AskResponse {
  answer: string;
  sql: string | null;
  rows: Record<string, unknown>[];
}

export function AiPrompt() {
  const { t } = useSession();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<AskResponse | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setRes(null);
    try {
      setRes(await api<AskResponse>("/ai/ask", { method: "POST", body: JSON.stringify({ question: q }) }));
    } catch {
      setRes({ answer: "Something went wrong.", sql: null, rows: [] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6">
      <form onSubmit={ask} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Ask anything… e.g. "how many ${t("leads").toLowerCase()} are in Qualified?"`}
          className="w-full bg-transparent text-sm outline-none placeholder:text-gray-600"
        />
        <button disabled={busy} className="shrink-0 rounded-md bg-indigo-600 px-3 py-1 text-sm text-white disabled:opacity-50">
          {busy ? "…" : "Ask"}
        </button>
      </form>
      {res && (
        <div className="mt-3 border-t border-gray-800 pt-3">
          <p className="text-sm text-gray-200">{res.answer}</p>
          {res.sql && <p className="mt-2 font-mono text-[11px] text-gray-600">{res.sql}</p>}
        </div>
      )}
    </Card>
  );
}
