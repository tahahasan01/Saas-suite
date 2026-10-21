"use client";

import { useId, useState } from "react";
import type { Contact, ContactBrief, ContactLookup } from "@business-os/types";
import { api, ApiError } from "@/lib/api";
import { useCan } from "@/lib/can";
import { errorText } from "@/lib/useAction";
import { Button, Input } from "@/components/ui";
import { useContactLabels } from "./labels";

export type Customer = Pick<ContactBrief, "id" | "name" | "phone">;

/** Who is buying, at the till: a walk-in by default. Type the phone, pick
 *  the match (a shared family number lists everyone on it; the cashier
 *  chooses, nothing is attached automatically) or add a new one by name. */
export function CustomerPicker({ value, onChange }: { value: Customer | null; onChange: (c: Customer | null) => void }) {
  const { one } = useContactLabels();
  const can = useCan();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [result, setResult] = useState<ContactLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!can("pos.sale.create") && !can("contacts.contact.read")) return null;

  function reset() {
    setOpen(false); setPhone(""); setName(""); setResult(null); setError(null);
  }

  async function find(e?: React.FormEvent) {
    e?.preventDefault();
    if (!phone.trim()) return;
    setBusy(true); setError(null);
    try {
      setResult(await api<ContactLookup>(`/contacts/lookup?phone=${encodeURIComponent(phone)}`));
    } catch (err) {
      setError(errorText(err, "Couldn't look that number up."));
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!name.trim()) return;
    setBusy(true); setError(null);
    try {
      const c = await api<Contact>("/contacts", { method: "POST", notify: false, body: JSON.stringify({ name, phone }) });
      onChange({ id: c.id, name: c.name, phone: c.phone });
      reset();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409
        ? "That number is already saved. Press Find to choose them."
        : errorText(err, `Couldn't add the ${one.toLowerCase()}.`));
    } finally {
      setBusy(false);
    }
  }

  if (value) {
    return (
      <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-elevated px-3 py-2 text-sm" data-testid="pos-customer">
        <span className="min-w-0 truncate"><span className="text-fg-muted">{one}: </span><span className="font-medium">{value.name}</span></span>
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Remove</Button>
      </div>
    );
  }
  if (!open) {
    return (
      <div className="mb-3 flex items-center justify-between gap-2 text-sm">
        <span className="text-fg-muted">Walk-in {one.toLowerCase()}</span>
        <Button size="sm" variant="subtle" onClick={() => setOpen(true)}>Add {one.toLowerCase()}</Button>
      </div>
    );
  }
  return (
    <div className="mb-3 space-y-2 rounded-lg border border-line p-3 text-sm">
      <form onSubmit={find} className="flex items-end gap-2">
        <label htmlFor={`${id}-phone`} className="sr-only">{one} phone</label>
        <Input id={`${id}-phone`} type="tel" inputMode="tel" placeholder={`${one} phone`} value={phone}
               onChange={(e) => { setPhone(e.target.value); setResult(null); }} />
        <Button type="submit" size="sm" disabled={busy || !phone.trim()}>Find</Button>
        <Button type="button" size="sm" variant="ghost" onClick={reset}>Cancel</Button>
      </form>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {result && (
        <div aria-live="polite" className="space-y-1.5">
          {result.shared && <p className="text-xs text-warning">Many people share this number — choose carefully.</p>}
          {result.matches.map((m) => (
            <button key={m.id} type="button" onClick={() => { onChange({ id: m.id, name: m.name, phone: m.phone }); reset(); }}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-start hover:bg-elevated pointer-coarse:min-h-11">
              <span className="truncate font-medium">{m.name}</span>
              <span className="text-xs text-fg-muted">{m.phone}</span>
            </button>
          ))}
          {result.matches.length === 0 && (
            <div className="flex items-end gap-2">
              <label htmlFor={`${id}-name`} className="sr-only">New {one.toLowerCase()} name</label>
              <Input id={`${id}-name`} placeholder={`New ${one.toLowerCase()} name`} value={name} onChange={(e) => setName(e.target.value)} />
              <Button size="sm" disabled={busy || !name.trim()} onClick={() => void add()}>Add</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
