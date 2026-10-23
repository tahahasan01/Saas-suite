"use client";

import { useCallback, useEffect, useState } from "react";
import type { Tag } from "@business-os/types";
import type { Schema } from "@business-os/api-client";
import { api, apiUrl } from "@/lib/api";
import { formatMonth, money } from "@/lib/format";
import { monthPKT } from "@/lib/dates";
import { useCan } from "@/lib/can";
import { useConfirm } from "@/components/Confirm";
import { errorText, useAction } from "@/lib/useAction";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";

type Plan = Schema<"InvoicePlanOut">;
type Run = Schema<"InvoiceRunOut">;
type RunDetail = Schema<"InvoiceRunDetail">;
type Segment = Schema<"SegmentOut">;

type DraftLine = { description: string; qty: string; price: string };
const emptyLine: DraftLine = { description: "", qty: "1", price: "" };

/** Fee vouchers (PRD INV-08): a plan bills everyone with a tag (or on a saved
 *  list) each month. Making a run creates drafts to check; issuing it numbers
 *  them all; the PDFs download as one ZIP. */
export function BillingPlans() {
  const can = useCan();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);

  const load = useCallback(() => {
    setError(null);
    api<Plan[]>("/invoices/plans").then(setPlans).catch((e) => setError(errorText(e, "Couldn't load the plans.")));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    api<Tag[]>("/tags").then(setTags).catch(() => setTags([]));
    api<Segment[]>("/crm/segments").then(setSegments).catch(() => setSegments([]));   // needs campaign rights
  }, []);

  const audience = (p: Plan) =>
    p.tag_id ? `Everyone tagged “${tags.find((t) => t.id === p.tag_id)?.name ?? "…"}”`
      : `Everyone on “${segments.find((s) => s.id === p.segment_id)?.name ?? "a saved list"}”`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">
          Bill a whole class or group each month: drafts are made for you to check, then issued together.
        </p>
        {can("invoicing.invoice.create") && !making && <Button onClick={() => setMaking(true)}>New plan</Button>}
      </div>
      {making && <NewPlan tags={tags} segments={segments} onCancel={() => setMaking(false)}
                          onSaved={() => { setMaking(false); load(); }} />}
      {error ? <ErrorState message={error} onRetry={load} /> : !plans ? <LoadingRows rows={2} label="Loading plans" /> : (
        plans.length === 0 ? (!making && <EmptyState title="No billing plans yet" hint="Make one for each class or group you bill every month." />) : (
          plans.map((p) => <PlanCard key={p.id} plan={p} audience={audience(p)} />)
        )
      )}
    </div>
  );
}

function NewPlan({ tags, segments, onCancel, onSaved }: {
  tags: Tag[]; segments: Segment[]; onCancel: () => void; onSaved: () => void;
}) {
  const [v, setV] = useState({ name: "", audience: "", due_day: "10", run_day: "" });
  const [lines, setLines] = useState<DraftLine[]>([{ ...emptyLine }]);
  const save = useAction(() => {
    const [kind, id] = v.audience.split(":");
    return api("/invoices/plans", { method: "POST", body: JSON.stringify({
      name: v.name, due_day: Number(v.due_day), run_day: v.run_day ? Number(v.run_day) : null,
      ...(kind === "tag" ? { tag_id: id } : { segment_id: id }),
      lines: lines.map((l) => ({ description: l.description.trim(), qty: Number(l.qty),
                                  unit_price_minor: Math.round(Number(l.price || 0) * 100) })),
    }) });
  }, { success: "Plan saved", failure: "Couldn't save the plan" });
  const setLine = (i: number, patch: Partial<DraftLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <Card>
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await save.run()) onSaved(); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Plan name"><Input required maxLength={120} placeholder="Class 5 monthly fee" value={v.name}
                                          onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="Bill">
            <Select required value={v.audience} onChange={(e) => setV({ ...v, audience: e.target.value })}>
              <option value="">Choose who…</option>
              <optgroup label="Everyone with a tag">
                {tags.map((t) => <option key={t.id} value={`tag:${t.id}`}>{t.name}</option>)}
              </optgroup>
              {segments.length > 0 && (
                <optgroup label="A saved list">
                  {segments.map((s) => <option key={s.id} value={`segment:${s.id}`}>{s.name}</option>)}
                </optgroup>
              )}
            </Select>
          </Field>
          <Field label="Due on day of the month"><Input type="number" inputMode="numeric" min={1} max={28} required value={v.due_day}
                                                        onChange={(e) => setV({ ...v, due_day: e.target.value })} /></Field>
          <Field label="Make the drafts each month on day (empty: by hand)">
            <Input type="number" inputMode="numeric" min={1} max={28} value={v.run_day}
                   onChange={(e) => setV({ ...v, run_day: e.target.value })} />
          </Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-fg-muted">On each invoice</legend>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_4.5rem_7rem_auto] items-end gap-2">
              <Field label={`Item ${i + 1}`}><Input required maxLength={300} value={l.description}
                                                    onChange={(e) => setLine(i, { description: e.target.value })} /></Field>
              <Field label="Qty"><Input type="number" inputMode="decimal" min={0.001} step="0.001" required value={l.qty}
                                         onChange={(e) => setLine(i, { qty: e.target.value })} /></Field>
              <Field label="Price (PKR)"><Input type="number" inputMode="decimal" min={0} step="0.01" required value={l.price}
                                                 onChange={(e) => setLine(i, { price: e.target.value })} /></Field>
              <Button size="sm" variant="ghost" type="button" disabled={lines.length === 1}
                      onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                Remove<span className="sr-only"> item {i + 1}</span>
              </Button>
            </div>
          ))}
          <Button size="sm" variant="subtle" type="button" onClick={() => setLines([...lines, { ...emptyLine }])}>Add an item</Button>
        </fieldset>
        {save.error && <p className="text-xs text-danger" role="alert">{save.error}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={save.busy}>{save.busy ? "Saving…" : "Save plan"}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}

function PlanCard({ plan: p, audience }: { plan: Plan; audience: string }) {
  const can = useCan();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [month, setMonth] = useState(monthPKT());
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => {
    api<Run[]>(`/invoices/plans/${p.id}/runs`).then(setRuns).catch(() => setRuns([]));
  }, [p.id]);
  useEffect(load, [load]);
  const make = useAction(() => api<Run>(`/invoices/plans/${p.id}/runs`, { method: "POST", body: JSON.stringify({ period: month }) }),
    { success: (r) => `${(r as Run).invoice_count} drafts made: check them, then issue`, failure: "Couldn't make the run" });
  const perInvoice = p.lines.reduce((sum, l) => sum + Math.round(Number(l.qty) * l.unit_price_minor), 0);

  return (
    <section aria-labelledby={`plan-${p.id}`}>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 id={`plan-${p.id}`} className="font-semibold">{p.name}</h3>
            <p className="text-xs text-fg-muted">
              {audience} · {money(perInvoice)} each before tax · due on the {p.due_day}{ordinal(p.due_day)}
              {p.run_day ? ` · drafts made on the ${p.run_day}${ordinal(p.run_day)}` : " · drafts made by hand"}
            </p>
          </div>
          {can("invoicing.invoice.create") && (
            <form className="flex items-end gap-2" onSubmit={async (e) => {
              e.preventDefault();
              const r = await make.run();
              if (r) { load(); setOpen((r as Run).id); }
            }}>
              <Field label="Month"><Input type="month" required value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
              <Button type="submit" size="sm" disabled={make.busy}>Make drafts</Button>
            </form>
          )}
        </div>
        {runs && runs.length > 0 && (
          <ul className="mt-3 divide-y divide-line text-sm">
            {runs.map((r) => (
              <li key={r.id} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button type="button" className="text-start hover:underline" aria-expanded={open === r.id}
                          onClick={() => setOpen(open === r.id ? null : r.id)}>
                    {formatMonth(r.period.slice(0, 7))}: {r.invoice_count} invoices, {money(r.total_minor)}
                  </button>
                  <Badge tone={r.status === "issued" ? "success" : "warning"}>{r.status === "issued" ? "Issued" : "Drafts"}</Badge>
                </div>
                {open === r.id && <RunPanel runId={r.id} onChanged={load} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

function RunPanel({ runId, onChanged }: { runId: string; onChanged: () => void }) {
  const can = useCan();
  const confirm = useConfirm();
  const [run, setRun] = useState<RunDetail | null>(null);
  const load = useCallback(() => {
    api<RunDetail>(`/invoices/runs/${runId}`).then(setRun).catch(() => setRun(null));
  }, [runId]);
  useEffect(load, [load]);
  const issue = useAction(() => api(`/invoices/runs/${runId}/issue`, { method: "POST" }),
    { success: "All issued, each with its own number", failure: "Couldn't issue the run" });

  if (!run) return <LoadingRows rows={2} label="Loading the run" />;
  const live = run.invoices.filter((i) => i.status !== "void");
  return (
    <div className="mt-2 space-y-2 rounded-md bg-elevated/40 p-2">
      <ul className="max-h-64 space-y-1 overflow-auto text-xs">
        {run.invoices.map((i) => (
          <li key={i.id} className="flex justify-between gap-2">
            <span className={i.status === "void" ? "text-fg-subtle line-through" : ""}>{i.contact_name ?? "—"}</span>
            <span className="tabular-nums text-fg-muted">{i.number ?? "draft"} · {money(i.total_minor)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {run.status === "draft" && can("invoicing.invoice.approve") && (
          <Button size="sm" disabled={issue.busy || live.length === 0} onClick={async () => {
            if (!(await confirm({
              title: `Issue ${live.length} invoices?`,
              body: "Each gets the next invoice number and can't be changed after. To leave someone out, void their draft first.",
              confirmLabel: "Issue all",
            }))) return;
            if (await issue.run()) { load(); onChanged(); }
          }}>
            Issue all
          </Button>
        )}
        {run.status === "issued" && (
          <a href={apiUrl(`/invoices/runs/${runId}/pdfs`)} className="text-sm text-brand hover:underline">Download PDFs (ZIP)</a>
        )}
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
}
