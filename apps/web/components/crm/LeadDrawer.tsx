"use client";

import { useCallback, useEffect, useState } from "react";
import type { Activity, FulfillmentSchema, Lead, LeadDetail, Stage, Tag } from "@business-os/types";
import type { Schema } from "@business-os/api-client";
import { api, apiUrl } from "@/lib/api";
import { formatDay, money } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { useCan } from "@/lib/can";
import { Sheet } from "@/components/Dialog";
import { Badge, Button, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";
import { ActivityActions, LostDialog, PriorityPicker, ScheduleActivity, TypeIcon } from "./bits";
import { TimelineList } from "./Timeline";
import { LeadContactCard } from "@/components/contacts/LeadContactCard";
import { TagChip } from "@/components/contacts/ContactForm";

const invTone = {
  draft: "neutral", pending_approval: "warning", issued: "brand", partially_paid: "warning", paid: "success", void: "danger",
} as const;
const INV_LABEL: Record<string, string> = {
  draft: "draft", pending_approval: "awaiting approval", issued: "issued", partially_paid: "part paid", paid: "paid", void: "void",
};
type InvoiceSummary = Schema<"InvoiceSummary">;
const stateTone = { overdue: "danger", today: "warning", planned: "neutral", done: "success", cancelled: "neutral" } as const;

/** Lead details in a right-hand sheet. `name` comes from the board so the
 *  sheet is announced by the lead's name before its details have loaded. */
export function LeadDrawer({ leadId, name, stages, onMove, onClose, onChanged }: {
  leadId: string;
  name: string;
  stages: Stage[];
  onMove: (id: string, stageId: string) => Promise<boolean>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<LeadDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [losing, setLosing] = useState(false);
  const can = useCan();
  const mayEdit = can("crm.lead.update");

  const load = useCallback(() => {
    setLoadError(null);
    api<LeadDetail>(`/crm/leads/${leadId}`)
      .then(setData)
      // Was `setData(null)`, which left the sheet on "Loading…" forever.
      .catch((e) => setLoadError(errorText(e, "Couldn't load this lead.")));
  }, [leadId]);
  useEffect(load, [load]);

  const refresh = useCallback(() => { load(); onChanged(); }, [load, onChanged]);

  async function changeStage(stageId: string) {
    if (!data || stageId === data.lead.stage_id) return;
    setMoving(true);
    setData({ ...data, lead: { ...data.lead, stage_id: stageId } }); // optimistic; the board does the same
    await onMove(leadId, stageId); // the board toasts a failure
    setMoving(false);
    load(); // picks up the status (a won lead grows the fulfilment form), or reverts on failure
  }

  const win = useAction(() => api(`/crm/leads/${leadId}/won`, { method: "POST" }),
    { success: "Marked as won", failure: "Couldn't mark it won" });
  const restore = useAction(() => api(`/crm/leads/${leadId}/restore`, { method: "POST" }),
    { success: "Restored", failure: "Couldn't restore it" });

  const lead = data?.lead;
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      side="right"
      title={lead?.name ?? name}
      description={lead?.company || undefined}
    >
      <div className="p-5">
        {!data || !lead ? (
          loadError ? <ErrorState message={loadError} onRetry={load} /> : <LoadingRows rows={4} label="Loading lead" />
        ) : (
          <>
            <StatusBar
              lead={lead}
              mayEdit={mayEdit}
              busy={win.busy || restore.busy}
              onWon={async () => { if ((await win.run()) !== undefined) refresh(); }}
              onLost={() => setLosing(true)}
              onRestore={async () => { if ((await restore.run()) !== undefined) refresh(); }}
            />

            {/* Moving without dragging: works by touch, keyboard and screen reader. */}
            <div className="mb-5">
              <Field label="Move to stage">
                <Select value={lead.stage_id} disabled={moving || !mayEdit} onChange={(e) => changeStage(e.target.value)}>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.is_won ? " (won)" : ""}</option>
                  ))}
                </Select>
              </Field>
              {stages.find((s) => s.id === lead.stage_id)?.requirements && (
                <p className="mt-1 text-xs text-fg-muted">
                  {stages.find((s) => s.id === lead.stage_id)?.requirements}
                </p>
              )}
            </div>

            {editing ? (
              <EditLead
                lead={lead}
                onCancel={() => setEditing(false)}
                onSaved={() => { setEditing(false); refresh(); }}
              />
            ) : (
              <>
                <dl className="mb-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <Info label="Phone" value={lead.phone || "—"} />
                  <Info label="Email" value={lead.email || "—"} />
                  <Info label="Value" value={money(lead.value_minor, lead.currency)} />
                  <Info label="Source" value={lead.source} />
                </dl>
                {mayEdit && (
                  <div className="mb-4">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit details</Button>
                  </div>
                )}
              </>
            )}

            <LeadContactCard lead={lead} onChanged={refresh} />

            <DealFields lead={lead} disabled={!mayEdit} onSaved={refresh} />

            {lead.status === "won" && <Fulfillment leadId={leadId} />}

            <Invoices leadId={leadId} onChanged={onChanged} />

            <ActivitiesPanel leadId={leadId} items={data.activities} onChanged={refresh} canPlan={can("crm.activity.manage")} />

            <TimelineList leadId={leadId} first={data.timeline} onNoted={load} />

            <LostDialog
              leadId={leadId}
              name={lead.name}
              open={losing}
              onClose={() => setLosing(false)}
              onDone={() => { setLosing(false); refresh(); }}
            />
          </>
        )}
      </div>
    </Sheet>
  );
}

function StatusBar({ lead, mayEdit, busy, onWon, onLost, onRestore }: {
  lead: Lead; mayEdit: boolean; busy: boolean;
  onWon: () => void; onLost: () => void; onRestore: () => void;
}) {
  return (
    <div className="mb-5 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm">
          <span className="text-fg-muted">Status</span>
          <Badge tone={lead.status === "won" ? "success" : lead.status === "lost" ? "danger" : "brand"}>
            {lead.status === "open" ? "Open" : lead.status === "won" ? "Won" : "Lost"}
          </Badge>
        </span>
        {mayEdit && (
          <span className="flex gap-2">
            {lead.status === "open" && (
              <Button size="sm" disabled={busy} onClick={onWon}>Won</Button>
            )}
            {lead.status !== "lost" && (
              <Button size="sm" variant="subtle" disabled={busy} onClick={onLost}>Lost</Button>
            )}
            {lead.status === "lost" && (
              <Button size="sm" variant="subtle" disabled={busy} onClick={onRestore}>Restore</Button>
            )}
          </span>
        )}
      </div>
      {lead.status === "lost" && (
        <div className="mt-2 text-xs text-fg-muted">
          <p>{lead.lost_reason ?? "No reason given"}{lead.lost_at && ` · ${formatDay(lead.lost_at.slice(0, 10))}`}</p>
          {lead.lost_note && <p className="mt-1 whitespace-pre-line break-words">{lead.lost_note}</p>}
        </div>
      )}
    </div>
  );
}

/** Probability (auto from the stage, or set by hand), expected close and priority. */
function DealFields({ lead, disabled, onSaved }: { lead: Lead; disabled: boolean; onSaved: () => void }) {
  const [prob, setProb] = useState(lead.probability?.toString() ?? "");
  useEffect(() => setProb(lead.probability?.toString() ?? ""), [lead.probability]);
  const save = useAction(
    (patch: Record<string, unknown>) => api(`/crm/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    { failure: "Couldn't save that" },
  );
  async function patch(p: Record<string, unknown>) {
    if ((await save.run(p)) !== undefined) onSaved();
  }
  return (
    <section className="mb-6 space-y-3 rounded-lg border border-line p-3" aria-label="Deal">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Probability (%)">
          <span className="flex items-center gap-2">
            <Input
              type="number" inputMode="numeric" min={0} max={100} className="w-20"
              value={prob} disabled={disabled}
              onChange={(e) => setProb(e.target.value)}
              onBlur={() => {
                if (prob === "" || Number(prob) === lead.probability) return;
                const n = Math.max(0, Math.min(100, Math.round(Number(prob))));
                patch({ probability: n });
              }}
            />
            {lead.probability_is_manual ? (
              <Button size="sm" variant="ghost" type="button" disabled={disabled} onClick={() => patch({ probability_auto: true })}>
                Use stage default
              </Button>
            ) : (
              <span className="text-xs text-fg-subtle">Auto</span>
            )}
          </span>
        </Field>
        <Field label="Expected close">
          <Input
            type="date" disabled={disabled}
            value={lead.expected_close_date ?? ""}
            onChange={(e) => patch({ expected_close_date: e.target.value || null })}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2">
          <span className="text-xs text-fg-muted">Priority</span>
          <PriorityPicker value={lead.priority} disabled={disabled} onChange={(v) => patch({ priority: v })} />
        </span>
        <span className="text-xs text-fg-muted">
          Weighted value <span className="font-medium tabular-nums text-fg">{money(lead.weighted_value_minor, lead.currency)}</span>
        </span>
      </div>
      <LeadTags lead={lead} disabled={disabled} onChange={(ids) => patch({ tag_ids: ids })} />
    </section>
  );
}

/** The lead's tags, from the list contacts share; add from a picker, remove with ×. */
function LeadTags({ lead, disabled, onChange }: { lead: Lead; disabled: boolean; onChange: (ids: string[]) => void }) {
  const [all, setAll] = useState<Tag[] | null>(null);
  useEffect(() => {
    // Reading the tag list needs contacts read; without it the lead's own tags still show.
    api<Tag[]>("/tags").then(setAll).catch(() => setAll([]));
  }, []);
  const mine = lead.tags.map((t) => t.id);
  const free = (all ?? []).filter((t) => !mine.includes(t.id));
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-xs text-fg-muted">Tags</span>
      {lead.tags.length === 0 && <span className="text-xs text-fg-subtle">None</span>}
      {lead.tags.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-0.5">
          <TagChip tag={t} />
          {!disabled && (
            <button type="button" className="rounded px-1 text-xs text-fg-subtle hover:text-fg"
                    aria-label={`Remove tag ${t.name}`} onClick={() => onChange(mine.filter((id) => id !== t.id))}>
              ×
            </button>
          )}
        </span>
      ))}
      {!disabled && free.length > 0 && (
        <span className="w-32">
          <Select value="" aria-label="Add tag" className="py-1 text-xs"
                  onChange={(e) => e.target.value && onChange([...mine, e.target.value])}>
            <option value="">Add tag…</option>
            {free.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </span>
      )}
    </div>
  );
}

function ActivitiesPanel({ leadId, items, onChanged, canPlan }: {
  leadId: string; items: Activity[]; onChanged: () => void; canPlan: boolean;
}) {
  return (
    <section className="mb-6 space-y-3 rounded-lg border border-line p-3" aria-labelledby={`act-${leadId}`}>
      <h3 id={`act-${leadId}`} className="text-xs font-semibold text-fg">Activities</h3>
      {items.length === 0 ? (
        <p className="text-sm text-fg-subtle">Nothing planned. Schedule the next step so it shows up in My day.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <TypeIcon icon={a.type_icon} />
                <span className="min-w-0">
                  <span className="block truncate" title={a.summary}>{a.summary}</span>
                  <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
                    <Badge tone={stateTone[a.state]}>{a.state === "planned" ? formatDay(a.due_date) : a.state}</Badge>
                    {a.assigned_name && <span>{a.assigned_name}</span>}
                  </span>
                </span>
              </span>
              {canPlan && <ActivityActions activity={a} onChanged={onChanged} />}
            </li>
          ))}
        </ul>
      )}
      {canPlan && <ScheduleActivity entityId={leadId} onSaved={onChanged} compact />}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="truncate text-fg" title={value}>{value}</dd>
    </div>
  );
}

/** What a won deal still needs (delivery date, plan…). Shown only once the
 *  saved values have loaded: saving an empty form over a failed load would wipe
 *  them. */
function Fulfillment({ leadId }: { leadId: string }) {
  const [schema, setSchema] = useState<FulfillmentSchema | null>(null);
  const [fdata, setFdata] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([
      api<FulfillmentSchema>("/crm/fulfillment/schema"),
      api<{ data: Record<string, string> }>(`/crm/leads/${leadId}/fulfillment`),
    ])
      .then(([s, d]) => { setSchema(s); setFdata(d.data ?? {}); })
      .catch((e) => setError(errorText(e, "Couldn't load the fulfilment details.")));
  }, [leadId]);
  useEffect(load, [load]);

  const save = useAction(
    () => api(`/crm/leads/${leadId}/fulfillment`, { method: "PUT", body: JSON.stringify({ data: fdata }) }),
    { success: "Details saved", failure: "Couldn't save the details" },
  );

  if (error) return <div className="mb-6"><ErrorState message={error} onRetry={load} /></div>;
  if (!schema || !fdata) return null;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); save.run(); }}
      className="mb-6 space-y-3 rounded-lg border border-brand/40 bg-brand-subtle/40 p-3"
    >
      <h3 className="text-xs font-semibold text-brand"><span aria-hidden>🎉 </span>{schema.label}</h3>
      {schema.fields.map((f) => (
        <Field key={f.key} label={f.label}>
          {f.type === "select" ? (
            <Select value={fdata[f.key] ?? ""} onChange={(e) => setFdata({ ...fdata, [f.key]: e.target.value })}>
              <option value="">—</option>
              {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
            </Select>
          ) : (
            <Input
              type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
              inputMode={f.type === "number" ? "decimal" : undefined}
              value={fdata[f.key] ?? ""}
              onChange={(e) => setFdata({ ...fdata, [f.key]: e.target.value })}
            />
          )}
        </Field>
      ))}
      <Button type="submit" size="sm" disabled={save.busy} className="w-full">
        {save.busy ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}

function Invoices({ leadId, onChanged }: { leadId: string; onChanged: () => void }) {
  const [invoices, setInvoices] = useState<InvoiceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inv, setInv] = useState({ amount: "", discount: "0" });

  const load = useCallback(() => {
    setError(null);
    api<InvoiceSummary[]>(`/invoices?lead_id=${leadId}`)
      .then(setInvoices)
      .catch((e) => setError(errorText(e, "Couldn't load invoices.")));
  }, [leadId]);
  useEffect(load, [load]);

  // A money write: useAction refuses a second run while the first is in
  // flight, so a double tap can't post two invoices. The quick request is a
  // one-line invoice sent straight for approval (invoices v2, 3E).
  const request = useAction(
    (amount: number, discountPct: number) => {
      const price = Math.round(amount * 100);
      return api<InvoiceSummary>("/invoices", {
        method: "POST",
        body: JSON.stringify({
          lead_id: leadId, submit: true,
          lines: [{ description: "Services", qty: 1, unit_price_minor: price,
                    line_discount_minor: Math.round((price * discountPct) / 100) }],
        }),
      });
    },
    { success: "Invoice requested — accounts will approve it", failure: "Couldn't request the invoice" },
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const created = await request.run(Number(inv.amount || 0), Number(inv.discount || 0));
    if (!created) return; // keep what was typed so it can be retried
    setInv({ amount: "", discount: "0" });
    load();
    onChanged();
  }

  return (
    <section className="mb-6 space-y-3 rounded-lg border border-line p-3" aria-labelledby={`inv-${leadId}`}>
      <h3 id={`inv-${leadId}`} className="text-xs font-semibold text-fg">Invoices</h3>
      <form onSubmit={submit} className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_auto]">
        <Field label="Amount (PKR)">
          <Input type="number" inputMode="decimal" min={0} step="0.01" value={inv.amount} onChange={(e) => setInv({ ...inv, amount: e.target.value })} required />
        </Field>
        <Field label="Disc %">
          <Input type="number" inputMode="decimal" min={0} max={100} value={inv.discount} onChange={(e) => setInv({ ...inv, discount: e.target.value })} />
        </Field>
        <Button type="submit" disabled={request.busy} className="col-span-2 sm:col-span-1">
          {request.busy ? "Requesting…" : "Request"}
        </Button>
      </form>
      {error && <ErrorState message={error} onRetry={load} />}
      {invoices?.map((iv) => (
        <div key={iv.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-fg-muted">{iv.number ?? "Awaiting number"} · {money(iv.total_minor)}</span>
          <span className="flex items-center gap-2">
            <Badge tone={invTone[iv.status as keyof typeof invTone] ?? "neutral"}>{INV_LABEL[iv.status] ?? iv.status}</Badge>
            {!["draft", "pending_approval"].includes(iv.status) && (
              <a href={apiUrl(`/invoices/${iv.id}/pdf`)} target="_blank" rel="noreferrer" className="text-brand hover:underline">PDF</a>
            )}
          </span>
        </div>
      ))}
    </section>
  );
}

/** PATCH /crm/leads/{id} already accepted these; nothing ever called it, so a
 *  typo in a phone number was permanent. */
function EditLead({ lead, onCancel, onSaved }: { lead: Lead; onCancel: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: lead.name,
    company: lead.company,
    phone: lead.phone,
    email: lead.email,
    value: (lead.value_minor / 100).toString(),
  });
  const save = useAction(
    () => api(`/crm/leads/${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: f.name,
        company: f.company,
        phone: f.phone,
        email: f.email,
        value_minor: Math.round(Number(f.value || 0) * 100),
      }),
    }),
    { success: "Changes saved", failure: "Couldn't save those changes" },
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((await save.run()) !== undefined) onSaved();
  }

  return (
    <form onSubmit={submit} className="mb-6 space-y-3 rounded-lg border border-line bg-elevated/40 p-3">
      <Field label="Name">
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
      </Field>
      <Field label="Company">
        <Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Phone">
          <Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label="Value (PKR)">
          <Input type="number" inputMode="decimal" min={0} step="0.01" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
        </Field>
      </div>
      <Field label="Email">
        <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </Field>
      {save.error && <p className="text-xs text-danger" role="alert">{save.error}</p>}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={save.busy}>{save.busy ? "Saving…" : "Save"}</Button>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
