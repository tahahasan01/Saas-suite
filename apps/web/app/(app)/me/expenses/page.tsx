"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDay, money } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { type Claim, ClaimForm, ClaimLines, ClaimStatus } from "@/components/hrms/Expenses";
import { Button, Card, EmptyState, ErrorState, LoadingRows } from "@/components/ui";

/** My expense claims, paid back with my salary once approved (wave C, H13). */
export default function MyExpenses() {
  const [rows, setRows] = useState<Claim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => {
    setError(null);
    api<Claim[]>("/me/expenses").then(setRows).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);
  const cancel = useAction((c: Claim) => api(`/me/expenses/${c.id}/cancel`, { method: "POST" }), { success: "Claim withdrawn", failure: "Couldn't withdraw it" });
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {adding ? (
        <Card><ClaimForm url="/me/expenses" onDone={() => { setAdding(false); load(); }} /></Card>
      ) : <Button onClick={() => setAdding(true)}>New expense claim</Button>}
      {error ? <ErrorState message={error} onRetry={load} /> : rows === null ? <LoadingRows rows={2} label="Loading your claims" /> : rows.length === 0 ? (
        <EmptyState title="No claims yet" hint="Spent your own money on company work? Claim it here and it's paid back with your salary." />
      ) : (
        <ul className="space-y-3" aria-label="My claims">
          {rows.map((c) => (
            <li key={c.id}>
              <Card className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><span className="font-semibold">{c.title}</span> <span className="text-xs text-fg-muted">· {formatDay(c.created_at.slice(0, 10))}</span></span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{money(c.approved_minor ?? c.total_minor)}{c.approved_minor != null && c.approved_minor !== c.total_minor ? ` of ${money(c.total_minor)}` : ""}</span>
                    <ClaimStatus c={c} />
                  </span>
                </div>
                <ClaimLines c={c} />
                {c.decision_note && <p className="text-xs text-fg-muted">Note: {c.decision_note}</p>}
                {c.status === "submitted" && (
                  <div className="flex justify-end">
                    <Button size="sm" variant="ghost" disabled={cancel.busy} onClick={async () => { if ((await cancel.run(c)) !== undefined) load(); }}>Withdraw</Button>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
