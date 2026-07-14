"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const leads = t("leads").toLowerCase();
  const suggestions = [
    `How many ${leads} are in Qualified?`,
    `What's my total won value this month?`,
    `Which ${leads} haven't been contacted?`,
  ];

  async function run(question: string) {
    if (!question.trim()) return;
    setQ(question);
    setBusy(true);
    setRes(null);
    setError(null);
    try {
      setRes(await api<AskResponse>("/ai/ask", { method: "POST", body: JSON.stringify({ question }) }));
    } catch (e) {
      // 503 = no key on this deployment, 429 = monthly quota spent. Both are
      // states worth naming; neither is an answer to the question asked.
      setError(
        e instanceof ApiError && typeof e.detail === "string"
          ? e.detail
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6">
      <form onSubmit={(e) => { e.preventDefault(); run(q); }} className="flex items-center gap-2">
        <span className="text-brand">✦</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything about your business…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-fg-subtle"
        />
        <button disabled={busy} className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg disabled:opacity-50">
          {busy ? "…" : "Ask AI"}
        </button>
      </form>

      {!res && !error && !busy && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => run(s)}
                    className="rounded-full border border-line px-3 py-1 text-xs text-fg-muted transition-colors hover:border-brand/50 hover:text-fg">
              {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 border-t border-line pt-3">
          <span className="text-warning" aria-hidden>●</span>
          <p className="text-sm text-fg-muted">{error}</p>
        </div>
      )}

      {res && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-sm text-fg">{res.answer}</p>
          {res.sql && <p className="mt-2 font-mono text-[11px] text-fg-subtle">{res.sql}</p>}
        </div>
      )}
    </Card>
  );
}
