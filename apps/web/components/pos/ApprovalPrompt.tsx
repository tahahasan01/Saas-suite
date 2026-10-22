"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Dialog } from "@/components/Dialog";
import { Button, Field, Input, Select } from "@/components/ui";

export type ApprovalKey = "pos.sale.discount" | "pos.price.override" | "pos.session.approve";
export interface Approval { approver_id: string; approver_pin: string }
interface Approver { user_id: string; name: string }

/** A manager approves at the till with their 6-digit PIN (0076/0078). The
 *  server checks the PIN on the action itself; this only collects it.
 *  `onApprove` resolves to an error message to show, or null when done. */
export function ApprovalPrompt({ open, need, reason, onApprove, onCancel }: {
  open: boolean;
  need: ApprovalKey;
  reason: string;
  onApprove: (a: Approval) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [people, setPeople] = useState<Approver[] | null>(null);
  const [who, setWho] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPin("");
    setError(null);
    setPeople(null);
    api<Approver[]>(`/pos/approvers?need=${need}`, { notify: false })
      .then((p) => { setPeople(p); setWho((w) => (p.some((x) => x.user_id === w) ? w : p[0]?.user_id ?? "")); })
      .catch(() => setPeople([]));
  }, [open, need]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!who || pin.length !== 6) return;
    setBusy(true);
    const err = await onApprove({ approver_id: who, approver_pin: pin });
    setBusy(false);
    if (err) { setError(err); setPin(""); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }} title="Manager approval" size="sm"
            footer={
              <>
                <Button variant="subtle" onClick={onCancel} className="flex-1">Cancel</Button>
                <Button type="submit" form="approval-form" className="flex-1"
                        disabled={busy || !who || pin.length !== 6}>{busy ? "Checking…" : "Approve"}</Button>
              </>
            }>
      <form id="approval-form" onSubmit={submit} className="space-y-3">
        <p className="text-sm text-fg-muted">{reason}</p>
        {people !== null && people.length === 0 ? (
          <p className="rounded-lg border border-line p-3 text-sm">
            No one who can approve this has set a till PIN yet. A manager sets theirs on the Registers page.
          </p>
        ) : (
          <>
            <Field label="Approved by">
              <Select value={who} onChange={(e) => setWho(e.target.value)} disabled={people === null}>
                {(people ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Their PIN">
              <Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} pattern="\d{6}"
                     value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                     aria-describedby={error ? "approval-error" : undefined} autoFocus />
            </Field>
          </>
        )}
        {error && <p id="approval-error" role="alert" className="text-sm text-danger">{error}</p>}
      </form>
    </Dialog>
  );
}
