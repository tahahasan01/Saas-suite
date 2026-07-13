"use client";

import { useCallback, useEffect, useState } from "react";
import {
  INTERACTION_CHANNELS,
  INTERACTION_OUTCOMES,
  type LeadDetail,
} from "@business-os/types";
import { api } from "@/lib/api";
import { money, relativeDate } from "@/lib/format";
import { Button } from "@/components/ui";

const emptyLog = { channel: "call", outcome: "", note: "", follow: "" };

export function LeadDrawer({ leadId, onClose, onChanged }: { leadId: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<LeadDetail | null>(null);
  const [log, setLog] = useState(emptyLog);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<LeadDetail>(`/crm/leads/${leadId}`).then(setData).catch(() => setData(null));
  }, [leadId]);

  useEffect(load, [load]);

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

            <dl className="mb-6 grid grid-cols-2 gap-2 text-sm">
              <Info label="Phone" value={data.lead.phone || "—"} />
              <Info label="Email" value={data.lead.email || "—"} />
              <Info label="Value" value={money(data.lead.value_minor, data.lead.currency)} />
              <Info label="Source" value={data.lead.source} />
            </dl>

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
