"use client";

import { useState } from "react";
import { LEAD_SOURCES, type DuplicateMatch, type Lead } from "@business-os/types";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button, Card, Field, Input } from "@/components/ui";

export function AddLeadForm({ onClose, onCreated }: { onClose: () => void; onCreated: (l: Lead) => void }) {
  const { t } = useSession();
  const [f, setF] = useState({ name: "", company: "", phone: "", email: "", source: "manual", value: "" });
  const [dups, setDups] = useState<DuplicateMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(force: boolean) {
    setBusy(true);
    setError(null);
    try {
      const lead = await api<Lead>("/crm/leads", {
        method: "POST",
        body: JSON.stringify({
          name: f.name, company: f.company, phone: f.phone, email: f.email,
          source: f.source, value_minor: Math.round(Number(f.value || 0) * 100), force,
        }),
      });
      onCreated(lead);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const detail = err.detail as { duplicates?: DuplicateMatch[] };
        setDups(detail.duplicates ?? []);
      } else {
        setError(err instanceof Error ? err.message : "Failed to create");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <Card className="w-full max-w-md space-y-3" >
        <div onClick={(e) => e.stopPropagation()} className="space-y-3">
          <h2 className="text-sm font-semibold">New {t("lead")}</h2>
          <form onSubmit={(e) => { e.preventDefault(); submit(false); }} className="space-y-3">
            <Field label={`${t("lead")} name`}>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Company"><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
              <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
              <Field label={`Value (${"PKR"})`}><Input type="number" min={0} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
            </div>
            <Field label="Source">
              <select className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm"
                      value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
                {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>

            {dups && (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                <p className="mb-1 font-medium text-warning">Possible duplicate found:</p>
                <ul className="mb-2 space-y-0.5 text-warning/80">
                  {dups.map((d) => <li key={d.id}>• {d.name} {d.company && `(${d.company})`} — matched on {d.reason}</li>)}
                </ul>
                <button type="button" onClick={() => submit(true)} className="text-xs text-warning underline">
                  Create anyway
                </button>
              </div>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy} className="flex-1">{busy ? "Saving…" : "Create"}</Button>
              <button type="button" onClick={onClose} className="rounded-md px-3 text-sm text-fg-muted">Cancel</button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
