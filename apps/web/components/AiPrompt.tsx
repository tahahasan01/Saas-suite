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
  const { me, t } = useSession();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const on = (key: string) => !!me?.entitlements.some((e) => e.section_key === key && e.enabled);
  const leads = t("leads").toLowerCase();

  // Suggestions follow the tenant's modules — and lead with a cross-module
  // question when they have more than one, because that is the answer no
  // separate CRM, POS or HR product can give.
  const suggestions = [
    on("pos") && on("hrms") && "Who sold the most this week, and were they in every day?",
    on("crm") && on("pos") && `Compare my won ${leads} to my actual sales this month`,
    on("crm") && `Which ${leads} haven't been contacted?`,
    on("pos") && "What's running out of stock?",
    on("hrms") && "Who is off today?",
  ].filter(Boolean).slice(0, 3) as string[];

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
      <form onSubmit={(e) => { e.preventDefault(); run(q); }} className="flex items-center gap-2" role="search">
        <span className="text-brand" aria-hidden>✦</span>
        {/* 16px on phones so iOS doesn't zoom into the field; min-w-0 lets it
            shrink beside the button on a 320px screen. */}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything about your business…"
          aria-label="Ask a question about your business"
          className="w-full min-w-0 bg-transparent text-base outline-none placeholder:text-fg-subtle sm:text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg disabled:opacity-50 pointer-coarse:min-h-11"
        >
          {busy ? <><span aria-hidden>…</span><span className="sr-only">Thinking</span></> : "Ask AI"}
        </button>
      </form>

      {!res && !error && !busy && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => run(s)}
                    className="rounded-full border border-line px-3 py-1 text-left text-xs text-fg-muted transition-colors hover:border-brand/50 hover:text-fg pointer-coarse:min-h-10">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Always mounted, so a screen reader hears the answer (or the reason
          there isn't one) when it arrives. */}
      <div aria-live="polite" aria-busy={busy}>
        {error && (
          <div className="mt-3 flex items-start gap-2 border-t border-line pt-3">
            <span className="text-warning" aria-hidden>●</span>
            <p className="text-sm text-fg-muted">{error}</p>
          </div>
        )}

        {res && (
          <div className="mt-3 border-t border-line pt-3">
            <p className="break-words text-sm text-fg">{res.answer}</p>
            {res.sql && <p className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] text-fg-subtle">{res.sql}</p>}
          </div>
        )}
      </div>
    </Card>
  );
}
