"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Dialog } from "@/components/Dialog";
import { Combobox } from "@/components/Combobox";
import { DropdownMenu } from "@/components/DropdownMenu";
import { Button, Field, Input } from "@/components/ui";

/* Cashier = employee (3C, 0080, pos_hrms): staff sign in at the till with
 * their PIN; the token rides on each sale as X-Cashier-Token. Kept for this
 * browser tab only, so closing the till signs the cashier out. */

interface Cashier { employee_id: string; name: string }
interface Signed { token: string; name: string }
const KEY = "bos.cashier";

export function cashierToken(): string | null {
  try { return (JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Signed | null)?.token ?? null; }
  catch { return null; }
}
export function forgetCashier() {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing kept */ }
  window.dispatchEvent(new Event("bos-cashier"));
}

export function CashierSignIn() {
  const [staff, setStaff] = useState<Cashier[] | null>(null);   // null = cashier PINs not in use here
  const [signed, setSigned] = useState<Signed | null>(null);
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const read = useCallback(() => {
    try { setSigned(JSON.parse(sessionStorage.getItem(KEY) ?? "null")); } catch { setSigned(null); }
  }, []);
  useEffect(() => {
    read();
    window.addEventListener("bos-cashier", read);
    // Only with both POS and Staff on; otherwise the till works as before.
    api<Cashier[]>("/pos/cashiers", { notify: false }).then(setStaff).catch(() => setStaff(null));
    return () => window.removeEventListener("bos-cashier", read);
  }, [read]);

  if (staff === null) return null;

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ cashier_token: string; employee_name: string }>("/pos/cashiers/sign-in", {
        method: "POST", notify: false, body: JSON.stringify({ employee_id: who, pin }) });
      try { sessionStorage.setItem(KEY, JSON.stringify({ token: r.cashier_token, name: r.employee_name })); } catch { /* this tab only */ }
      setSigned({ token: r.cashier_token, name: r.employee_name });
      setOpen(false);
      setPin("");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 423 ? "Too many wrong PINs. Ask a manager to unlock it."
               : err instanceof ApiError ? err.message : "Couldn't sign in");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const token = cashierToken();
    forgetCashier();
    if (token) await api("/pos/cashiers/sign-out", { method: "POST", notify: false, headers: { "X-Cashier-Token": token } }).catch(() => {});
  }

  return (
    <>
      {signed ? (
        <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface ps-2.5 text-sm">
          <span className="text-fg-muted">Cashier</span> <span className="font-medium">{signed.name}</span>
          <DropdownMenu label={`Cashier ${signed.name}`} trigger={<span aria-hidden="true">▾</span>}
                        items={[{ label: "Switch cashier", onSelect: () => setOpen(true) },
                                { label: "Sign out", onSelect: () => void signOut() }]} />
        </span>
      ) : (
        <Button size="sm" variant="subtle" onClick={() => setOpen(true)}>Cashier sign-in</Button>
      )}
      <Dialog open={open} onOpenChange={setOpen} title="Cashier sign-in" size="sm"
              footer={<Button type="submit" form="cashier-form" className="w-full"
                              disabled={busy || !who || pin.length < 4}>{busy ? "Signing in…" : "Sign in"}</Button>}>
        <form id="cashier-form" onSubmit={signIn} className="space-y-3">
          <Combobox label="Who's on the till" placeholder="Type a name" value={who} onChange={setWho}
                    options={staff.map((s) => ({ value: s.employee_id, label: s.name }))}
                    emptyText="No one by that name has a PIN yet" />
          <Field label="PIN">
            <Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin}
                   onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </Field>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </form>
      </Dialog>
    </>
  );
}
