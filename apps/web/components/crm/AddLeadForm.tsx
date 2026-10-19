"use client";

import { useRef, useState } from "react";
import { LEAD_SOURCES, type DuplicateMatch, type Lead } from "@business-os/types";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { errorText } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { Button, Field, Input, Select } from "@/components/ui";

const FORM_ID = "new-lead-form";

/* Not on useAction: a 409 here isn't a failure to toast, it's the duplicate
 * check asking a question. The in-flight ref gives the same no-double-post
 * guarantee — "Create anyway" tapped twice made two leads before. */
export function AddLeadForm({ onClose, onCreated }: { onClose: () => void; onCreated: (l: Lead) => void }) {
  const { t } = useSession();
  const [f, setF] = useState({ name: "", company: "", phone: "", email: "", source: "manual", value: "" });
  const [dups, setDups] = useState<DuplicateMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Editing a field after a duplicate warning means "check again", not "force".
  function set<K extends keyof typeof f>(k: K, v: string) {
    setF((cur) => ({ ...cur, [k]: v }));
    setDups(null);
  }

  async function submit(force: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
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
        setError(errorText(err, "Couldn't create it. Please try again."));
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      dismissible={false}
      open
      onOpenChange={(o) => !o && onClose()}
      title={`New ${t("lead")}`}
      // Start in the name field, not on the ✕ that Radix would pick first.
      onOpenAutoFocus={(e) => { e.preventDefault(); nameRef.current?.focus(); }}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          {/* The buttons live in the footer, outside the scrolling body, so
              Create is on screen even on a landscape phone; `form` ties them
              back to the form. */}
          {dups ? (
            <Button type="button" disabled={busy} onClick={() => submit(true)}>
              {busy ? "Saving…" : "Create anyway"}
            </Button>
          ) : (
            <Button type="submit" form={FORM_ID} disabled={busy}>{busy ? "Saving…" : "Create"}</Button>
          )}
        </>
      }
    >
      <form id={FORM_ID} onSubmit={(e) => { e.preventDefault(); submit(false); }} className="space-y-3">
        <Field label={`${t("lead")} name`}>
          <Input ref={nameRef} value={f.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Company"><Input value={f.company} onChange={(e) => set("company", e.target.value)} /></Field>
          <Field label="Phone"><Input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Value (PKR)">
            <Input type="number" inputMode="decimal" min={0} value={f.value} onChange={(e) => set("value", e.target.value)} />
          </Field>
        </div>
        <Field label="Source">
          <Select value={f.source} onChange={(e) => set("source", e.target.value)}>
            {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>

        {dups && (
          <div role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="mb-1 font-medium text-warning">Possible duplicate found:</p>
            <ul className="space-y-0.5 text-fg-muted">
              {dups.map((d) => <li key={d.id}>• {d.name} {d.company && `(${d.company})`} — matched on {d.reason}</li>)}
            </ul>
            <p className="mt-2 text-xs text-fg-muted">Change the details to check again, or choose Create anyway.</p>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </form>
    </Dialog>
  );
}
