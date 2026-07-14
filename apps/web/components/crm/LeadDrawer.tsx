"use client";

import { useCallback, useEffect, useState } from "react";
import {
  INTERACTION_CHANNELS,
  INTERACTION_OUTCOMES,
  type FulfillmentSchema,
  type Invoice,
  type Lead,
  type LeadDetail,
} from "@business-os/types";
import { api } from "@/lib/api";
import { money, relativeDate } from "@/lib/format";
import { Badge, Button, Input } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const invTone = { pending: "warning", approved: "success", rejected: "danger" } as const;

const emptyLog = { channel: "call", outcome: "", note: "", follow: "" };

export function LeadDrawer({ leadId, onClose, onChanged }: { leadId: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<LeadDetail | null>(null);
  const [log, setLog] = useState(emptyLog);
  const [busy, setBusy] = useState(false);
  const [schema, setSchema] = useState<FulfillmentSchema | null>(null);
  const [fdata, setFdata] = useState<Record<string, string>>({});
  const [fsaving, setFsaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    api<LeadDetail>(`/crm/leads/${leadId}`).then(setData).catch(() => setData(null));
  }, [leadId]);

  useEffect(load, [load]);

  useEffect(() => {
    api<FulfillmentSchema>("/crm/fulfillment/schema").then(setSchema).catch(() => {});
    api<{ data: Record<string, string> }>(`/crm/leads/${leadId}/fulfillment`)
      .then((r) => setFdata(r.data ?? {}))
      .catch(() => {});
  }, [leadId]);

  async function saveFulfillment() {
    setFsaving(true);
    try {
      await api(`/crm/leads/${leadId}/fulfillment`, { method: "PUT", body: JSON.stringify({ data: fdata }) });
    } finally {
      setFsaving(false);
    }
  }

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [inv, setInv] = useState({ amount: "", discount: "0" });

  const loadInvoices = useCallback(() => {
    api<Invoice[]>("/crm/invoices")
      .then((all) => setInvoices(all.filter((x) => x.lead_id === leadId)))
      .catch(() => setInvoices([]));
  }, [leadId]);
  useEffect(loadInvoices, [loadInvoices]);

  async function requestInvoice(e: React.FormEvent) {
    e.preventDefault();
    await api("/crm/invoices", {
      method: "POST",
      body: JSON.stringify({
        lead_id: leadId,
        amount_minor: Math.round(Number(inv.amount || 0) * 100),
        discount_pct: Number(inv.discount || 0),
      }),
    }).catch(() => {});
    setInv({ amount: "", discount: "0" });
    loadInvoices();
    onChanged();
  }

  async function submitLog(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/crm/leads/${leadId}/interactions`, {
        method: "POST",
        body: JSON.stringify({
          channel: log.channel,
          outcome: log.outcome || null,
          note: log.note,
          next_follow_up_at: log.follow ? new Date(log.follow).toISOString() : null,
        }),
      });
      setLog(emptyLog);
      load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/50" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-line bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        {!data ? (
          <p className="text-sm text-fg-subtle">Loading…</p>
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">{data.lead.name}</h2>
                {data.lead.company && <p className="text-sm text-fg-muted">{data.lead.company}</p>}
              </div>
              <button onClick={onClose} className="text-fg-subtle hover:text-fg">✕</button>
            </div>

            {editing ? (
              <EditLead
                lead={data.lead}
                onCancel={() => setEditing(false)}
                onSaved={() => { setEditing(false); load(); onChanged(); }}
              />
            ) : (
              <>
                <dl className="mb-2 grid grid-cols-2 gap-2 text-sm">
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

            {data.lead.stage_kind === "won" && schema && (
              <div className="mb-6 space-y-2 rounded-lg border border-brand/40 bg-brand-subtle/40 p-3">
                <p className="text-xs font-semibold text-brand">🎉 {schema.label}</p>
                {schema.fields.map((f) => (
                  <label key={f.key} className="block text-xs text-fg-subtle">
                    {f.label}
                    {f.type === "select" ? (
                      <select value={fdata[f.key] ?? ""} onChange={(e) => setFdata({ ...fdata, [f.key]: e.target.value })}
                              className="mt-1 w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm text-fg">
                        <option value="">—</option>
                        {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                             value={fdata[f.key] ?? ""} onChange={(e) => setFdata({ ...fdata, [f.key]: e.target.value })}
                             className="mt-1 w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm text-fg" />
                    )}
                  </label>
                ))}
                <Button size="sm" onClick={saveFulfillment} disabled={fsaving} className="w-full">
                  {fsaving ? "Saving…" : "Save details"}
                </Button>
              </div>
            )}

            <div className="mb-6 space-y-2 rounded-lg border border-line p-3">
              <p className="text-xs font-semibold text-fg">Invoices</p>
              <form onSubmit={requestInvoice} className="flex items-end gap-2">
                <label className="flex-1 text-xs text-fg-subtle">
                  Amount (PKR)
                  <Input type="number" min={0} value={inv.amount} onChange={(e) => setInv({ ...inv, amount: e.target.value })} required className="mt-1" />
                </label>
                <label className="w-20 text-xs text-fg-subtle">
                  Disc %
                  <Input type="number" min={0} max={100} value={inv.discount} onChange={(e) => setInv({ ...inv, discount: e.target.value })} className="mt-1" />
                </label>
                <Button type="submit" size="sm">Request</Button>
              </form>
              {invoices.map((iv) => (
                <div key={iv.id} className="flex items-center justify-between text-xs">
                  <span className="text-fg-muted">{money(iv.total_minor)}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={invTone[iv.status]}>{iv.status}</Badge>
                    {iv.status === "approved" && (
                      <a href={`${API}/crm/invoices/${iv.id}/pdf`} target="_blank" rel="noreferrer" className="text-brand hover:underline">PDF</a>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <form onSubmit={submitLog} className="mb-6 space-y-2 rounded-lg border border-line p-3">
              <p className="text-xs font-semibold text-fg">Log interaction</p>
              <div className="grid grid-cols-2 gap-2">
                <select className="rounded-md border border-line bg-canvas px-2 py-1.5 text-sm"
                        value={log.channel} onChange={(e) => setLog({ ...log, channel: e.target.value })}>
                  {INTERACTION_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="rounded-md border border-line bg-canvas px-2 py-1.5 text-sm"
                        value={log.outcome} onChange={(e) => setLog({ ...log, outcome: e.target.value })}>
                  <option value="">outcome…</option>
                  {INTERACTION_OUTCOMES.map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
                </select>
              </div>
              <textarea placeholder="Call notes…" value={log.note} onChange={(e) => setLog({ ...log, note: e.target.value })}
                        className="w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm" rows={2} />
              <label className="block text-xs text-fg-subtle">
                Next follow-up
                <input type="datetime-local" value={log.follow} onChange={(e) => setLog({ ...log, follow: e.target.value })}
                       className="mt-1 w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm" />
              </label>
              <Button type="submit" disabled={busy} className="w-full">{busy ? "Saving…" : "Log"}</Button>
            </form>

            <p className="mb-2 text-xs font-semibold text-fg-muted">Timeline</p>
            <ul className="space-y-3">
              {data.interactions.length === 0 && <li className="text-sm text-fg-subtle">No interactions yet.</li>}
              {data.interactions.map((i) => (
                <li key={i.id} className="border-l-2 border-line pl-3 text-sm">
                  <p className="text-fg">
                    <span className="font-medium capitalize">{i.channel}</span>
                    {i.outcome && <span className="text-brand"> · {i.outcome.replace("_", " ")}</span>}
                  </p>
                  {i.note && <p className="text-fg-muted">{i.note}</p>}
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
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="text-fg">{value}</dd>
    </div>
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
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await api(`/crm/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: f.name,
          company: f.company,
          phone: f.phone,
          email: f.email,
          value_minor: Math.round(Number(f.value || 0) * 100),
        }),
      });
      onSaved();
    } catch {
      setErr("Couldn't save those changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mb-6 space-y-3 rounded-lg border border-line bg-elevated/40 p-3">
      <label className="block text-xs text-fg-subtle">Name
        <Input className="mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
      </label>
      <label className="block text-xs text-fg-subtle">Company
        <Input className="mt-1" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-fg-subtle">Phone
          <Input className="mt-1" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </label>
        <label className="block text-xs text-fg-subtle">Value (PKR)
          <Input className="mt-1" type="number" min={0} step="0.01" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
        </label>
      </div>
      <label className="block text-xs text-fg-subtle">Email
        <Input className="mt-1" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </label>
      {err && <p className="text-xs text-danger">{err}</p>}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
