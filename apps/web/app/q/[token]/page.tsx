"use client";

import { use, useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { apiUrl } from "@/lib/api";
import { formatDay, money } from "@/lib/format";
import { Badge, Button, Card, Field, Input, Textarea } from "@/components/ui";

/* The customer's quote (wave D). No login: the link's token is the only
   credential, and it reaches this one quote. Plain fetch, not lib/api: a
   404 here is "this link is dead", not "your session ended". The page counts
   a view with its own POST, because the GET is also what WhatsApp's link
   preview fetches. */

type Quote = Schema<"QuotePublic">;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init, headers: { "Content-Type": "application/json" }, credentials: "omit", cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.detail === "string" ? body.detail : "Something went wrong. Try again.");
  return body as T;
}

export default function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const base = `/public/quotes/${encodeURIComponent(token)}`;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const load = useCallback(() => {
    call<Quote>(base).then(setQuote).catch((e: Error) => setFatal(e.message));
  }, [base]);
  useEffect(() => {
    load();
    call(`${base}/view`, { method: "POST" }).catch(() => undefined);   // a missed count is harmless
  }, [base, load]);

  return (
    <main className="min-h-dvh bg-canvas px-4 py-8 text-fg">
      <div className="mx-auto max-w-2xl">
        {fatal ? (
          <Card><p className="p-6 text-center">{fatal}</p></Card>
        ) : !quote ? (
          <p className="text-center text-fg-muted" role="status">Loading the quote…</p>
        ) : (
          <QuoteDocument quote={quote} base={base} onAnswered={setQuote} />
        )}
      </div>
    </main>
  );
}

function QuoteDocument({ quote: q, base, onAnswered }: { quote: Quote; base: string; onAnswered: (q: Quote) => void }) {
  const b = q.business;
  return (
    <Card>
      <article className="space-y-6 p-5 sm:p-8" aria-labelledby="quote-title">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-display text-lg font-semibold">{b.name}</p>
            <p className="text-xs text-fg-muted">
              {[b.address, b.city].filter(Boolean).join(", ")}
              {b.phone && <><br />{b.phone}</>}
              {b.ntn && <><br />NTN {b.ntn}</>}
            </p>
          </div>
          <div className="text-end">
            <h1 id="quote-title" className="font-display text-xl font-semibold">Quote {q.number}</h1>
            <p className="text-sm text-fg-muted">Valid until {formatDay(q.valid_until)}</p>
          </div>
        </header>

        <p className="text-sm"><span className="text-fg-muted">For </span>{q.customer_name}</p>

        <table className="w-full text-sm">
          <caption className="sr-only">What is quoted</caption>
          <thead>
            <tr className="border-b border-line text-start text-xs text-fg-muted">
              <th scope="col" className="py-2 text-start font-medium">Item</th>
              <th scope="col" className="py-2 text-end font-medium">Qty</th>
              <th scope="col" className="py-2 text-end font-medium">Price</th>
              <th scope="col" className="py-2 text-end font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {q.lines.map((l, i) => (
              <tr key={i} className="border-b border-line align-top">
                <td className="py-2 pe-2">
                  {l.description}
                  {(l.line_discount_minor > 0 || l.tax_rate_pct > 0) && (
                    <span className="block text-xs text-fg-subtle">
                      {l.line_discount_minor > 0 && `Discount ${money(l.line_discount_minor)}`}
                      {l.line_discount_minor > 0 && l.tax_rate_pct > 0 && " · "}
                      {l.tax_rate_pct > 0 && `Tax ${l.tax_rate_pct}%`}
                    </span>
                  )}
                </td>
                <td className="py-2 text-end tabular-nums">{l.qty} {l.unit}</td>
                <td className="py-2 text-end tabular-nums">{money(l.unit_price_minor)}</td>
                <td className="py-2 text-end tabular-nums">{money(l.net_excl_minor)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ms-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm tabular-nums">
          <dt className="text-fg-muted">Before tax</dt><dd className="text-end">{money(q.net_minor)}</dd>
          <dt className="text-fg-muted">Tax</dt><dd className="text-end">{money(q.tax_minor)}</dd>
          <dt className="font-semibold">Total</dt><dd className="text-end font-semibold">{money(q.total_minor)}</dd>
        </dl>

        {q.terms && (
          <section aria-labelledby="terms">
            <h2 id="terms" className="text-xs font-semibold text-fg-muted">Terms</h2>
            <p className="mt-1 whitespace-pre-line text-sm">{q.terms}</p>
          </section>
        )}

        <Answer quote={q} base={base} onAnswered={onAnswered} />

        <p className="flex flex-wrap gap-2 print:hidden">
          <a href={apiUrl(`${base}/pdf`)} className="inline-flex items-center rounded-md px-2 text-sm font-medium text-brand hover:underline">
            Download PDF
          </a>
          <Button size="sm" variant="ghost" onClick={() => window.print()}>Print</Button>
        </p>
      </article>
    </Card>
  );
}

function Answer({ quote: q, base, onAnswered }: { quote: Quote; base: string; onAnswered: (q: Quote) => void }) {
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (q.status === "accepted") {
    return (
      <p className="rounded-md border border-success/40 bg-success/10 p-3 text-sm" role="status">
        <Badge tone="success">Accepted</Badge>{" "}
        by {q.accepted_name}{q.accepted_at && ` on ${formatDay(q.accepted_at.slice(0, 10))}`}. Thank you.
      </p>
    );
  }
  if (q.status === "declined") {
    return <p className="rounded-md border border-line p-3 text-sm" role="status">You declined this quote. Thank you for letting us know.</p>;
  }
  if (q.status === "expired") {
    return <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm" role="status">This quote has expired. Ask {q.business.name} for a new one.</p>;
  }

  async function act(path: string, body: unknown) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onAnswered(await call<Quote>(`${base}/${path}`, { method: "POST", body: JSON.stringify(body) }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-md border border-line p-4 print:hidden" aria-labelledby="answer">
      <h2 id="answer" className="font-semibold">Accept this quote</h2>
      {!declining ? (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act("accept", { name, content_hash: q.content_hash }); }}>
          <Field label="Your full name">
            <Input value={name} required maxLength={120} autoComplete="name" onChange={(e) => setName(e.target.value)} />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I accept this quote of {money(q.total_minor)} and its terms.</span>
          </label>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !agree || !name.trim()}>{busy ? "Sending…" : "Accept quote"}</Button>
            <Button type="button" variant="ghost" onClick={() => setDeclining(true)}>Decline</Button>
          </div>
        </form>
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act("decline", { reason }); }}>
          <Field label="Why not? (optional)">
            <Textarea rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="subtle" disabled={busy}>{busy ? "Sending…" : "Decline quote"}</Button>
            <Button type="button" variant="ghost" onClick={() => setDeclining(false)}>Back</Button>
          </div>
        </form>
      )}
    </section>
  );
}
