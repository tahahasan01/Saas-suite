"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api, apiUrl } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { useAction } from "@/lib/useAction";
import { type Letter, REQUEST_KINDS } from "@/components/hrms/Letters";
import { Badge, Button, Card, EmptyState, Field, Input, Select } from "@/components/ui";

type Request = Schema<"LetterRequestOut">;
const TONE = { pending: "brand", issued: "success", declined: "neutral" } as const;

/** Ask HR for a letter or an ID card, and download letters issued to me (wave C, H17). */
export default function MyLetters() {
  const [letters, setLetters] = useState<Letter[] | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [f, setF] = useState({ kind: "experience", purpose: "" });
  const load = useCallback(() => {
    api<Letter[]>("/me/letters", { notify: false }).then(setLetters).catch(() => setLetters([]));
    api<Request[]>("/me/letter-requests", { notify: false }).then(setRequests).catch(() => setRequests([]));
  }, []);
  useEffect(load, [load]);
  const ask = useAction(() => api("/me/letter-requests", { method: "POST", body: JSON.stringify(f) }),
                        { success: "Request sent to HR", failure: "Couldn't send it" });
  return (
    <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section aria-labelledby="my-letters" className="min-w-0 space-y-3">
        <h2 id="my-letters" className="font-display text-lg font-semibold">My letters</h2>
        {letters === null ? null : letters.length === 0 ? <EmptyState title="No letters yet" hint="Ask HR for one with the form." /> : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label="My letters">
            {letters.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span><span className="font-medium">{l.title}</span><span className="block text-xs text-fg-muted">{l.number} · {formatDay(l.issued_at.slice(0, 10))}</span></span>
                <a href={apiUrl(`/me/letters/${l.id}/pdf`)} className="text-sm text-brand hover:underline">Download</a>
              </li>
            ))}
          </ul>
        )}
        {requests.length > 0 && (
          <ul className="space-y-1 text-sm" aria-label="My letter requests">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{REQUEST_KINDS[r.kind]}{r.purpose ? ` · ${r.purpose}` : ""}{r.note ? <span className="block text-xs text-fg-muted">HR: {r.note}</span> : null}</span>
                <Badge tone={TONE[r.status]}>{r.status === "pending" ? "waiting" : r.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Ask HR</h2>
        <form aria-label="Ask for a letter" className="space-y-2"
              onSubmit={async (e) => { e.preventDefault(); if ((await ask.run()) !== undefined) { setF({ ...f, purpose: "" }); load(); } }}>
          <Field label="I need">
            <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              {Object.entries(REQUEST_KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="What for"><Input value={f.purpose} maxLength={500} onChange={(e) => setF({ ...f, purpose: e.target.value })} placeholder="Bank loan, visa…" /></Field>
          <Button type="submit" size="sm" disabled={ask.busy}>Send request</Button>
        </form>
      </Card>
    </div>
  );
}
