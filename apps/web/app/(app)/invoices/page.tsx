"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import type { ContactBrief } from "@business-os/types";
import { api, apiUrl } from "@/lib/api";
import { Can, useCan } from "@/lib/can";
import { formatDateTime, formatDay, money, relativeDate } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Badge, Button, EmptyState, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { Sheet } from "@/components/Dialog";
import { useConfirm } from "@/components/Confirm";

type Summary = Schema<"InvoiceSummary">;
type Detail = Schema<"InvoiceDetail">;

/* Invoices v2 (3E): raise, approve, take payment, credit and void. Sales
   raise drafts; whoever holds the accounts keys approves and takes money. */

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", pending_approval: "Awaiting approval", issued: "Issued",
  partially_paid: "Part paid", paid: "Paid", void: "Void",
};
const STATUS_TONE = {
  draft: "neutral", pending_approval: "warning", issued: "brand", partially_paid: "warning", paid: "success", void: "danger",
} as const;
const FILTERS = [
  { key: "", label: "All" },
  { key: "pending_approval", label: "To approve" },
  { key: "overdue", label: "Overdue" },
  { key: "draft", label: "Drafts" },
  { key: "paid", label: "Paid" },
];
const METHODS = [
  ["bank", "Bank transfer"], ["cash", "Cash"], ["cheque", "Cheque"], ["card", "Card"], ["jazzcash", "JazzCash"],
  ["easypaisa", "Easypaisa"], ["raast", "Raast"], ["wht_adjustment", "WHT deducted by customer"],
] as const;

function ref(i: Pick<Summary, "number" | "legacy_ref" | "kind">) {
  return i.number ?? (i.legacy_ref ? `Ref ${i.legacy_ref}` : i.kind === "credit_note" ? "Credit note (draft)" : "Draft");
}

function StatusBadge({ i }: { i: Summary }) {
  if (i.overdue) return <Badge tone="danger">Overdue</Badge>;
  return <Badge tone={STATUS_TONE[i.status as keyof typeof STATUS_TONE] ?? "neutral"}>{STATUS_LABEL[i.status] ?? i.status}</Badge>;
}

export default function InvoicesPage() {
  const [filter, setFilter] = useState("");
  const [items, setItems] = useState<Summary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    const q = filter === "overdue" ? "?overdue=true" : filter ? `?status=${filter}` : "";
    api<Summary[]>(`/invoices${q}`)
      .then(setItems)
      .catch((e) => setLoadError(errorText(e, "Couldn't load invoices.")));
  }, [filter]);
  useEffect(load, [load]);

  const columns: Column<Summary>[] = [
    { key: "client", header: "Customer", primary: true,
      cell: (i) => <span className="font-medium">{i.contact_name ?? i.lead_name ?? "—"}</span> },
    { key: "number", header: "Number", cell: (i) => <span className="tabular-nums text-fg-muted">{ref(i)}</span> },
    { key: "total", header: "Total", align: "right", cell: (i) => money(i.total_minor) },
    { key: "balance", header: "Balance", align: "right",
      cell: (i) => (i.status === "void" ? "—" : money(i.balance_minor)) },
    { key: "status", header: "Status", cell: (i) => <StatusBadge i={i} /> },
    { key: "due", header: "Due", cell: (i) => <span className="text-fg-subtle">{i.due_date ? formatDay(i.due_date) : relativeDate(i.created_at)}</span> },
  ];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">Invoices raised by sales and approved by accounts. Approving gives the next invoice number.</p>
        <Can perm="invoicing.invoice.create">
          <Button onClick={() => setCreating(true)}>New invoice</Button>
        </Can>
      </div>
      <div role="tablist" aria-label="Show" className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={`rounded-full px-3 py-1 text-xs pointer-coarse:min-h-11 ${filter === f.key ? "bg-brand text-on-brand" : "bg-elevated text-fg-muted hover:text-fg"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : (
        <DataTable
          columns={columns}
          rows={items ?? []}
          rowKey={(i) => i.id}
          loading={items === null}
          caption="Invoices"
          empty={<EmptyState title="No invoices here yet" hint="Raise one with New invoice, or request one from a lead on the CRM board." />}
          actions={(i) => (
            <Button size="sm" variant="subtle" onClick={() => setOpenId(i.id)}>
              Open<span className="sr-only"> invoice for {i.contact_name ?? i.lead_name}</span>
            </Button>
          )}
        />
      )}

      <NewInvoice open={creating} onClose={() => setCreating(false)}
                  onCreated={(id) => { setCreating(false); load(); setOpenId(id); }} />
      <InvoiceSheet id={openId} onClose={() => setOpenId(null)} onChanged={load} onOpen={setOpenId} />
    </>
  );
}

// ── New invoice ────────────────────────────────────────────────────────────
type LineDraft = { description: string; qty: string; price: string; discount: string; tax_code: string };
const emptyLine: LineDraft = { description: "", qty: "1", price: "", discount: "", tax_code: "" };
const TAX_CODES = [["", "No sales tax"], ["gst_standard", "Sales tax 18%"], ["pst_services", "Provincial tax on services"],
                   ["gst_zero", "Zero-rated"]] as const;

function toMinor(v: string) { return Math.round(Number(v || 0) * 100); }

function NewInvoice({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [contact, setContact] = useState<ContactBrief | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([{ ...emptyLine }]);
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");
  const save = useAction(
    (submit: boolean) => api<Detail>("/invoices", {
      method: "POST",
      body: JSON.stringify({
        contact_id: contact?.id, due_date: due || null, notes, submit,
        lines: lines.filter((l) => l.description.trim()).map((l) => ({
          description: l.description, qty: Number(l.qty || 1), unit_price_minor: toMinor(l.price),
          line_discount_minor: toMinor(l.discount), tax_code: l.tax_code || null,
        })),
      }),
    }),
    { success: "Invoice saved", failure: "Couldn't save the invoice" },
  );
  const set = (i: number, k: keyof LineDraft, v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const ready = contact && lines.some((l) => l.description.trim() && Number(l.price) >= 0 && l.price !== "");

  async function go(submit: boolean) {
    const created = await save.run(submit);
    if (created) {
      setContact(null); setLines([{ ...emptyLine }]); setDue(""); setNotes("");
      onCreated(created.id);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="New invoice">
      <div className="space-y-4">
        <ContactSearch value={contact} onChange={setContact} />
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Lines</legend>
          {lines.map((l, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-line p-3">
              <Field label="Description"><Input value={l.description} maxLength={300} onChange={(e) => set(i, "description", e.target.value)} /></Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Qty"><Input type="number" inputMode="decimal" min={0.001} step="0.001" value={l.qty} onChange={(e) => set(i, "qty", e.target.value)} /></Field>
                <Field label="Price (PKR)"><Input type="number" inputMode="decimal" min={0} step="0.01" value={l.price} onChange={(e) => set(i, "price", e.target.value)} /></Field>
                <Field label="Discount (PKR)"><Input type="number" inputMode="decimal" min={0} step="0.01" value={l.discount} onChange={(e) => set(i, "discount", e.target.value)} /></Field>
              </div>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Field label="Sales tax">
                    <Select value={l.tax_code} onChange={(e) => set(i, "tax_code", e.target.value)}>
                      {TAX_CODES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                    </Select>
                  </Field>
                </div>
                {lines.length > 1 && (
                  <Button size="sm" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove<span className="sr-only"> line {i + 1}</span></Button>
                )}
              </div>
            </div>
          ))}
          <Button size="sm" variant="subtle" onClick={() => setLines([...lines, { ...emptyLine }])}>Add a line</Button>
        </fieldset>
        <Field label="Due date (optional; 30 days after approval if blank)"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="Notes for the customer"><Input value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!ready || save.busy} onClick={() => go(true)}>{save.busy ? "Saving…" : "Send for approval"}</Button>
          <Button variant="subtle" disabled={!ready || save.busy} onClick={() => go(false)}>Save as draft</Button>
        </div>
      </div>
    </Sheet>
  );
}

function ContactSearch({ value, onChange }: { value: ContactBrief | null; onChange: (c: ContactBrief | null) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ContactBrief[] | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return; }
    const t = setTimeout(() => {
      api<ContactBrief[]>(`/contacts?q=${encodeURIComponent(q)}&limit=8`).then(setHits).catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg bg-elevated px-3 py-2 text-sm">
        <span className="min-w-0 truncate"><span className="text-fg-muted">Bill to: </span><span className="font-medium">{value.name}</span></span>
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Change</Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Field label="Bill to"><Input value={q} placeholder="Search a customer by name or phone" onChange={(e) => setQ(e.target.value)} /></Field>
      {hits && (hits.length ? (
        <ul className="divide-y divide-line rounded-lg border border-line text-sm">
          {hits.map((c) => (
            <li key={c.id}>
              <button type="button" className="flex w-full justify-between gap-2 px-3 py-2 text-left hover:bg-elevated pointer-coarse:min-h-11"
                      onClick={() => { onChange(c); setQ(""); }}>
                <span className="truncate font-medium">{c.name}</span>
                <span className="text-fg-subtle">{c.phone || c.company_name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-fg-muted">No customer matches. Add them on the Customers page first.</p>)}
    </div>
  );
}

// ── One invoice ────────────────────────────────────────────────────────────
function InvoiceSheet({ id, onClose, onChanged, onOpen }: {
  id: string | null; onClose: () => void; onChanged: () => void; onOpen: (id: string) => void;
}) {
  const can = useCan();
  const confirm = useConfirm();
  const [inv, setInv] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [crediting, setCrediting] = useState(false);
  const [emailing, setEmailing] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setError(null);
    api<Detail>(`/invoices/${id}`).then(setInv).catch((e) => setError(errorText(e, "Couldn't load the invoice.")));
  }, [id]);
  useEffect(() => { setInv(null); setPaying(false); setCrediting(false); setEmailing(false); load(); }, [load]);

  const act = useAction(
    (path: string, body?: object) => api<Detail>(`/invoices/${id}/${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
    { failure: "Couldn't do that" },
  );
  async function run(path: string, body?: object) {
    const out = await act.run(path, body);
    if (out) { setInv(out); onChanged(); }
    return out;
  }
  const name = inv?.bill_to?.name ?? inv?.contact_name ?? inv?.lead_name ?? "";

  async function onApprove() {
    if (!inv) return;
    const done = await confirm({
      title: "Approve this invoice?",
      body: (
        <>
          <span className="font-medium text-fg">{money(inv.total_minor)}</span> for <span className="font-medium text-fg">{name}</span>.
          Approving gives it the next invoice number; after that its lines can't change.
        </>
      ),
      confirmLabel: "Approve",
      busyLabel: "Approving…",
      run: () => run("approve"),
    });
    if (done) load();
  }
  async function onVoid() {
    if (!inv) return;
    await confirm({
      title: `Void ${ref(inv)}?`,
      body: <>It stays on record, marked void, and keeps its number.</>,
      confirmLabel: "Void",
      busyLabel: "Voiding…",
      tone: "danger",
      run: () => run("void", { reason: "Voided" }),
    });
  }

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()} title={inv ? `${inv.kind === "credit_note" ? "Credit note" : "Invoice"} · ${name}` : "Invoice"}>
      {error ? <ErrorState message={error} onRetry={load} /> : !inv ? <LoadingRows rows={4} label="Loading invoice" /> : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold tabular-nums">{ref(inv)}</span>
            <StatusBadge i={inv} />
            {inv.issue_date && <span className="text-fg-muted">Issued {formatDay(inv.issue_date)}</span>}
            {inv.due_date && inv.kind === "invoice" && <span className="text-fg-muted">· Due {formatDay(inv.due_date)}</span>}
          </div>
          {inv.reason && <p className="rounded-lg bg-elevated px-3 py-2 text-fg-muted">{inv.status === "draft" ? "Sent back: " : ""}{inv.reason}</p>}
          {inv.unverified_rates && (
            <p role="note" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              A tax rate on this invoice hasn&apos;t been checked against the current Gazette yet. Verify before sending.
            </p>
          )}

          <table className="w-full text-left">
            <caption className="sr-only">Lines</caption>
            <thead className="text-xs text-fg-subtle"><tr><th className="py-1 font-medium">Item</th><th className="py-1 text-right font-medium">Qty</th><th className="py-1 text-right font-medium">Amount</th></tr></thead>
            <tbody className="divide-y divide-line">
              {inv.lines.map((l) => (
                <tr key={l.id}>
                  <td className="py-1.5">{l.description}{l.tax_minor > 0 && <span className="block text-xs text-fg-subtle">Tax {l.tax_rate_pct}% · {money(l.tax_minor)}</span>}</td>
                  <td className="py-1.5 text-right tabular-nums">{l.qty}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(l.total_minor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="space-y-1 border-t border-line pt-2">
            <Row label="Subtotal" value={money(inv.subtotal_minor)} />
            {(inv.line_discount_minor + inv.discount_minor) > 0 && <Row label="Discount" value={`−${money(inv.line_discount_minor + inv.discount_minor)}`} />}
            <Row label="Sales tax" value={money(inv.tax_minor)} />
            <Row label="Total" value={money(inv.total_minor)} strong />
            {inv.payments.map((p) => <Row key={p.id} label={`Paid ${formatDay(p.paid_on)}`} value={`−${money(p.amount_minor)}`} />)}
            {inv.credit_notes.map((c) => (
              <div key={c.id} className="flex justify-between gap-2">
                <dt><button type="button" className="text-brand hover:underline" onClick={() => onOpen(c.id)}>Credit note {c.number}</button></dt>
                <dd className="tabular-nums">−{money(c.total_minor)}</dd>
              </div>
            ))}
            {inv.kind === "invoice" && inv.status !== "void" && <Row label="Balance due" value={money(inv.balance_minor)} strong />}
          </dl>

          <div className="flex flex-wrap gap-2">
            {inv.status === "draft" && can("invoicing.invoice.create") && (
              <Button size="sm" disabled={act.busy} onClick={() => run("submit")}>Send for approval</Button>
            )}
            {inv.status === "pending_approval" && can("invoicing.invoice.approve") && (
              <>
                <Button size="sm" disabled={act.busy} onClick={onApprove}>Approve</Button>
                <Button size="sm" variant="subtle" disabled={act.busy} onClick={() => run("reject", { reason: "Please check and resend" })}>Send back</Button>
              </>
            )}
            {(inv.status === "issued" || inv.status === "partially_paid") && inv.kind === "invoice" && (
              <>
                {can("invoicing.payment.record") && <Button size="sm" onClick={() => setPaying(true)}>Record payment</Button>}
                {can("invoicing.invoice.approve") && <Button size="sm" variant="subtle" onClick={() => setCrediting(true)}>Credit note</Button>}
              </>
            )}
            {inv.status !== "void" && inv.status !== "paid" && inv.status !== "partially_paid" && inv.paid_minor === 0 && inv.credited_minor === 0
              && can("invoicing.invoice.void") && (
              <Button size="sm" variant="ghost" disabled={act.busy} onClick={onVoid}>Void</Button>
            )}
            {inv.kind === "invoice" && !["draft", "pending_approval", "void"].includes(inv.status)
              && can("invoicing.invoice.create") && (
              <Button size="sm" variant="subtle" onClick={() => setEmailing(true)}>Email to customer</Button>
            )}
            {!["draft", "pending_approval"].includes(inv.status) && (
              <a href={apiUrl(`/invoices/${inv.id}/pdf`)} target="_blank" rel="noreferrer"
                 className="inline-flex items-center text-sm text-brand hover:underline pointer-coarse:min-h-11">
                Download PDF<span className="sr-only"> for {name}</span>
              </a>
            )}
          </div>

          {inv.last_sent_at && <p className="text-xs text-fg-muted">Last emailed {formatDateTime(inv.last_sent_at)}</p>}
          {emailing && <EmailForm invoiceId={inv.id} onCancel={() => setEmailing(false)}
                                  onSent={() => { setEmailing(false); load(); }} />}
          {paying && <PaymentForm balance={inv.balance_minor} onCancel={() => setPaying(false)}
                                  onSave={async (body) => { if (await run("payments", body)) setPaying(false); }} busy={act.busy} />}
          {crediting && <CreditForm balance={inv.balance_minor} full={inv.paid_minor === 0 && inv.credited_minor === 0}
                                    onCancel={() => setCrediting(false)} busy={act.busy}
                                    onSave={async (body) => { if (await run("credit-notes", body)) { setCrediting(false); load(); } }} />}
        </div>
      )}
    </Sheet>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-fg-muted"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function PaymentForm({ balance, onSave, onCancel, busy }: {
  balance: number; onSave: (b: object) => void; onCancel: () => void; busy: boolean;
}) {
  const [f, setF] = useState({ method: "bank", amount: (balance / 100).toFixed(2), paid_on: new Date().toISOString().slice(0, 10), reference: "" });
  return (
    <form className="space-y-3 rounded-lg border border-line p-3"
          onSubmit={(e) => { e.preventDefault(); onSave({ method: f.method, amount_minor: toMinor(f.amount), paid_on: f.paid_on, reference: f.reference }); }}>
      <h3 className="text-sm font-semibold">Record a payment</h3>
      <div className="grid grid-cols-2 gap-2">
        <Field label="How"><Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
          {METHODS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </Select></Field>
        <Field label="Amount (PKR)"><Input type="number" inputMode="decimal" min={0.01} step="0.01" max={balance / 100} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></Field>
        <Field label="Date"><Input type="date" value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} required /></Field>
        <Field label="Reference"><Input value={f.reference} maxLength={120} placeholder="Cheque or transfer no." onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : "Save payment"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function CreditForm({ balance, full, onSave, onCancel, busy }: {
  balance: number; full: boolean; onSave: (b: object) => void; onCancel: () => void; busy: boolean;
}) {
  const [whole, setWhole] = useState(full);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  return (
    <form className="space-y-3 rounded-lg border border-line p-3"
          onSubmit={(e) => { e.preventDefault(); onSave({ reason, amount_minor: whole ? null : toMinor(amount) }); }}>
      <h3 className="text-sm font-semibold">Credit note</h3>
      {full && (
        <label className="flex items-center gap-2"><input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} /> Credit the whole invoice, line by line</label>
      )}
      {!whole && <Field label={`Amount (PKR, up to ${money(balance)})`}><Input type="number" inputMode="decimal" min={0.01} step="0.01" max={balance / 100} value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>}
      <Field label="Reason"><Input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} required /></Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !reason.trim()}>{busy ? "Saving…" : "Issue credit note"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

/** Email the invoice and its PDF; empty address = the customer's own. */
function EmailForm({ invoiceId, onCancel, onSent }: { invoiceId: string; onCancel: () => void; onSent: () => void }) {
  const [to, setTo] = useState("");
  const send = useAction(
    () => api<{ to: string }>(`/invoices/${invoiceId}/send`, { method: "POST", body: JSON.stringify({ to: to.trim() || null }) }),
    { success: (r) => `Invoice on its way to ${(r as { to: string }).to}`, failure: "Couldn't send the invoice" },
  );
  return (
    <form className="space-y-2 rounded-lg border border-line p-3"
          onSubmit={async (e) => { e.preventDefault(); if (await send.run()) onSent(); }}>
      <Field label="Send to (leave empty for the customer's email)">
        <Input type="email" autoComplete="email" maxLength={200} value={to} onChange={(e) => setTo(e.target.value)} />
      </Field>
      {send.error && <p className="text-xs text-danger" role="alert">{send.error}</p>}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={send.busy}>{send.busy ? "Sending…" : "Send"}</Button>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
