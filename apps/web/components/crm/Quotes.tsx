"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { formatDay, money } from "@/lib/format";
import { useCan } from "@/lib/can";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import { errorText, useAction } from "@/lib/useAction";
import { Badge, Button, ErrorState, Field, Input, LoadingRows, Textarea } from "@/components/ui";

type Quote = Schema<"QuoteOut">;

/** Where the customer opens the quote: this site's /q/{token} page. */
const fullLink = (path: string) => `${window.location.origin}${path}`;

function state(q: Quote): { label: string; tone: "brand" | "success" | "danger" | "warning" | "neutral" } {
  if (q.status === "sent") {
    if (q.expired) return { label: "Expired", tone: "warning" };
    return q.view_count ? { label: `Seen ${q.view_count}×`, tone: "brand" } : { label: "Sent", tone: "neutral" };
  }
  return {
    accepted: { label: "Accepted", tone: "success" as const },
    declined: { label: "Declined", tone: "danger" as const },
    superseded: { label: "Replaced", tone: "neutral" as const },
    cancelled: { label: "Cancelled", tone: "neutral" as const },
  }[q.status];
}

/** Quotes on a deal (wave D): freeze the products into a numbered quote the
 *  customer opens from a link and accepts with their name. */
export function QuotesPanel({ leadId, leadName, open, hasLines, onChanged }: {
  leadId: string; leadName: string; open: boolean; hasLines: boolean; onChanged: () => void;
}) {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const can = useCan();

  const load = useCallback(() => {
    setError(null);
    api<Quote[]>(`/crm/leads/${leadId}/quotes`)
      .then(setQuotes)
      .catch((e) => setError(errorText(e, "Couldn't load the quotes.")));
  }, [leadId]);
  useEffect(load, [load, hasLines]);

  const changed = () => { load(); onChanged(); };
  const mayMake = can("crm.quote.send") && open;
  return (
    <section className="mb-6 space-y-3 rounded-lg border border-line p-3" aria-labelledby={`quotes-${leadId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`quotes-${leadId}`} className="text-xs font-semibold text-fg">Quotes</h3>
        {mayMake && hasLines && !making && (
          <Button size="sm" variant="subtle" onClick={() => setMaking(true)}>Send a quote</Button>
        )}
      </div>
      {mayMake && !hasLines && <p className="text-xs text-fg-subtle">Add products to the deal to send a quote.</p>}
      {making && <NewQuote leadId={leadId} onCancel={() => setMaking(false)}
                           onSent={() => { setMaking(false); changed(); }} />}
      {error ? <ErrorState message={error} onRetry={load} /> : !quotes ? <LoadingRows rows={1} label="Loading quotes" /> : (
        quotes.length === 0 ? (!making && <p className="text-sm text-fg-subtle">No quotes yet.</p>) : (
          <ul className="space-y-2">
            {quotes.map((q) => <QuoteRow key={q.id} quote={q} leadName={leadName} onChanged={changed} />)}
          </ul>
        )
      )}
    </section>
  );
}

function NewQuote({ leadId, onCancel, onSent }: { leadId: string; onCancel: () => void; onSent: () => void }) {
  const [validUntil, setValidUntil] = useState("");
  const [terms, setTerms] = useState("");
  const send = useAction(
    () => api<Quote>(`/crm/leads/${leadId}/quotes`, {
      method: "POST",
      body: JSON.stringify({ valid_until: validUntil || null, terms }),
    }),
    { success: "Quote ready: copy the link or share it on WhatsApp", failure: "Couldn't make the quote" },
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (await send.run()) onSent();
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-line bg-elevated/40 p-2">
      <p className="text-xs text-fg-muted">
        The quote is a copy of the products as they are now. Sending a new one replaces the open quote.
      </p>
      <Field label="Valid until (leave empty for 15 days)">
        <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
      </Field>
      <Field label="Terms">
        <Textarea rows={3} maxLength={4000} value={terms} placeholder="e.g. 50% advance, rest on delivery"
                  onChange={(e) => setTerms(e.target.value)} />
      </Field>
      {send.error && <p className="text-xs text-danger" role="alert">{send.error}</p>}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={send.busy}>{send.busy ? "Making…" : "Make quote"}</Button>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function QuoteRow({ quote: q, leadName, onChanged }: { quote: Quote; leadName: string; onChanged: () => void }) {
  const can = useCan();
  const toast = useToast();
  const confirm = useConfirm();
  const s = state(q);
  const cancel = useAction(() => api(`/crm/quotes/${q.id}/cancel`, { method: "POST" }),
    { success: "Quote cancelled: its link no longer works", failure: "Couldn't cancel the quote" });
  const invoice = useAction(() => api(`/crm/quotes/${q.id}/invoice`, { method: "POST" }),
    { success: "Draft invoice made from the quote", failure: "Couldn't make the invoice" });

  async function copy() {
    if (!q.link) return;
    try {
      await navigator.clipboard.writeText(fullLink(q.link));
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Open the quote and copy the address instead.");
    }
  }
  const whatsapp = q.link
    ? `https://wa.me/?text=${encodeURIComponent(`Quote ${q.number} for ${leadName}: ${money(q.total_minor)}. ` +
        `View and accept it here: ${fullLink(q.link)}`)}`
    : null;

  return (
    <li className="space-y-1.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="tabular-nums">{q.number} · {money(q.total_minor)}</span>
        <Badge tone={s.tone}>{s.label}</Badge>
      </div>
      <p className="text-xs text-fg-subtle">
        {q.status === "accepted" && q.accepted_name
          ? `Accepted by ${q.accepted_name}${q.accepted_at ? ` on ${formatDay(q.accepted_at.slice(0, 10))}` : ""}`
          : q.status === "declined"
            ? `Declined${q.decline_reason ? `: ${q.decline_reason}` : ""}`
            : `Valid until ${formatDay(q.valid_until)}`}
      </p>
      <div className="flex flex-wrap gap-2">
        {q.link && (
          <>
            <Button size="sm" variant="ghost" onClick={copy}>Copy link</Button>
            {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer"
                            className="inline-flex items-center rounded-md px-2 text-xs font-medium text-brand hover:underline">
              Share on WhatsApp
            </a>}
            <a href={q.link} target="_blank" rel="noreferrer"
               className="inline-flex items-center rounded-md px-2 text-xs font-medium text-brand hover:underline">
              Open
            </a>
          </>
        )}
        {q.status === "sent" && can("crm.quote.send") && (
          <Button size="sm" variant="ghost" disabled={cancel.busy} onClick={async () => {
            if (!(await confirm({ title: `Cancel quote ${q.number}?`, body: "The customer's link stops working.",
                                  confirmLabel: "Cancel quote", tone: "danger" }))) return;
            if (await cancel.run()) onChanged();
          }}>
            Cancel quote
          </Button>
        )}
        {q.status === "accepted" && !q.invoice_id && can("invoicing.invoice.create") && (
          <Button size="sm" disabled={invoice.busy} onClick={async () => { if (await invoice.run()) onChanged(); }}>
            Make invoice
          </Button>
        )}
      </div>
    </li>
  );
}
