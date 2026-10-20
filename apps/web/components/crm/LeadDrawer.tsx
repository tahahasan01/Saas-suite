"use client";

import { useCallback, useEffect, useState } from "react";
import {
  INTERACTION_CHANNELS,
  INTERACTION_OUTCOMES,
  type FulfillmentSchema,
  type Invoice,
  type Lead,
  type LeadDetail,
  type Stage,
} from "@business-os/types";
import { api, apiUrl } from "@/lib/api";
import { money, relativeDate } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Sheet } from "@/components/Dialog";
import { Badge, Button, ErrorState, Field, Input, LoadingRows, Select, Textarea } from "@/components/ui";

const invTone = { pending: "warning", approved: "success", rejected: "danger" } as const;

const emptyLog = { channel: "call", outcome: "", note: "", follow: "" };

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

  const load = useCallback(() => {
    setLoadError(null);
    api<LeadDetail>(`/crm/leads/${leadId}`)
      .then(setData)
      // Was `setData(null)`, which left the sheet on "Loading…" forever.
      .catch((e) => setLoadError(errorText(e, "Couldn't load this lead.")));
  }, [leadId]);
  useEffect(load, [load]);

  async function changeStage(stageId: string) {
    if (!data || stageId === data.lead.stage_id) return;
    setMoving(true);
    setData({ ...data, lead: { ...data.lead, stage_id: stageId } }); // optimistic; the board does the same
    await onMove(leadId, stageId); // the board toasts a failure
    setMoving(false);
    load(); // picks up stage_kind (a won lead grows the fulfilment form), or reverts on failure
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      side="right"
      title={data?.lead.name ?? name}
      description={data?.lead.company || undefined}
    >
      <div className="p-5">
        {!data ? (
          loadError ? <ErrorState message={loadError} onRetry={load} /> : <LoadingRows rows={4} label="Loading lead" />
        ) : (
          <>
            {/* Moving without dragging: works by touch, keyboard and screen reader. */}
            <div className="mb-5">
              <Field label="Move to stage">
                <Select value={data.lead.stage_id} disabled={moving} onChange={(e) => changeStage(e.target.value)}>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.kind !== "active" ? ` (${s.kind})` : ""}</option>
                  ))}
                </Select>
              </Field>
            </div>

            {editing ? (
              <EditLead
                lead={data.lead}
                onCancel={() => setEditing(false)}
                onSaved={() => { setEditing(false); load(); onChanged(); }}
              />
            ) : (
              <>
                <dl className="mb-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <Info label="Phone" value={data.lead.phone || "—"} />
                  <Info label="Email" value={data.lead.email || "—"} />
                  <Info label="Value" value={money(data.lead.value_minor, data.lead.currency)} />
                  <Info label="Source" value={data.lead.source} />
                </dl>
                <div className="mb-6">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit details</Button>
                </div>
              </>
            )}

            {data.lead.stage_kind === "won" && <Fulfillment leadId={leadId} />}

            <Invoices leadId={leadId} onChanged={onChanged} />

            <LogInteraction leadId={leadId} onLogged={() => { load(); onChanged(); }} />

            <h3 className="mb-2 text-xs font-semibold text-fg-muted">Timeline</h3>
            <ul className="space-y-3">
              {data.interactions.length === 0 && <li className="text-sm text-fg-subtle">No interactions yet.</li>}
              {data.interactions.map((i) => (
                <li key={i.id} className="border-l-2 border-line pl-3 text-sm">
                  <p className="text-fg">
                    <span className="font-medium capitalize">{i.channel}</span>
                    {i.outcome && <span className="text-brand"> · {i.outcome.replace("_", " ")}</span>}
                  </p>
                  {i.note && <p className="break-words text-fg-muted">{i.note}</p>}
                  <p className="text-xs text-fg-subtle">
                    {relativeDate(i.created_at)}
                    {i.next_follow_up_at && ` · follow-up ${relativeDate(i.next_follow_up_at)}`}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Sheet>
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
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inv, setInv] = useState({ amount: "", discount: "0" });

  const load = useCallback(() => {
    setError(null);
    api<Invoice[]>("/crm/invoices")
      .then((all) => setInvoices(all.filter((x) => x.lead_id === leadId)))
      .catch((e) => setError(errorText(e, "Couldn't load invoices.")));
  }, [leadId]);
  useEffect(load, [load]);

  // A money write: useAction refuses a second run while the first is in
  // flight, so a double tap can't post two invoice requests.
  const request = useAction(
    (amount: number, discount: number) =>
      api<Invoice>("/crm/invoices", {
        method: "POST",
        body: JSON.stringify({ lead_id: leadId, amount_minor: Math.round(amount * 100), discount_pct: discount }),
      }),
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
          <span className="text-fg-muted">{money(iv.total_minor)}</span>
          <span className="flex items-center gap-2">
            <Badge tone={invTone[iv.status]}>{iv.status}</Badge>
            {iv.status === "approved" && (
              <a href={apiUrl(`/crm/invoices/${iv.id}/pdf`)} target="_blank" rel="noreferrer" className="text-brand hover:underline">PDF</a>
            )}
          </span>
        </div>
      ))}
    </section>
  );
}

function LogInteraction({ leadId, onLogged }: { leadId: string; onLogged: () => void }) {
  const [log, setLog] = useState(emptyLog);
  const save = useAction(
    () => api(`/crm/leads/${leadId}/interactions`, {
      method: "POST",
      body: JSON.stringify({
        channel: log.channel,
        outcome: log.outcome || null,
        note: log.note,
        next_follow_up_at: log.follow ? new Date(log.follow).toISOString() : null,
      }),
    }),
    { success: "Interaction logged", failure: "Couldn't log it" },
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await save.run();
    if (ok === undefined) return; // failed or already running: keep the notes
    setLog(emptyLog);
    onLogged();
  }

  return (
    <form onSubmit={submit} className="mb-6 space-y-3 rounded-lg border border-line p-3">
      <h3 className="text-xs font-semibold text-fg">Log interaction</h3>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Channel">
          <Select value={log.channel} onChange={(e) => setLog({ ...log, channel: e.target.value })}>
            {INTERACTION_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Outcome">
          <Select value={log.outcome} onChange={(e) => setLog({ ...log, outcome: e.target.value })}>
            <option value="">—</option>
            {INTERACTION_OUTCOMES.map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Notes">
        <Textarea placeholder="Call notes…" value={log.note} onChange={(e) => setLog({ ...log, note: e.target.value })} rows={2} />
      </Field>
      <Field label="Next follow-up">
        <Input type="datetime-local" value={log.follow} onChange={(e) => setLog({ ...log, follow: e.target.value })} />
      </Field>
      <Button type="submit" disabled={save.busy} className="w-full">{save.busy ? "Saving…" : "Log"}</Button>
    </form>
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
