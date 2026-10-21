"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { useCan } from "@/lib/can";
import { money } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

type Details = Schema<"PayrollDetailsOut">;

const MODE_LABEL = { bank: "Bank transfer", cash: "Cash", cheque: "Cheque" } as const;
type Mode = keyof typeof MODE_LABEL;

/* Payroll identity on the employee profile: bank, IBAN, NTN, EOBI and social
   security numbers. HR without pay access sees it masked and read-only; the
   server masks, this card only decides whether to offer the form. */
export function PayrollDetailsCard({ employeeId }: { employeeId: string }) {
  const can = useCan();
  const [d, setD] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api<Details>(`/payroll/employees/${employeeId}/details`).then(setD)
      .catch((e) => setError(errorText(e, "Couldn't load payroll details.")));
  }, [employeeId]);
  useEffect(load, [load]);

  if (error) return <Card><p className="text-sm text-danger">{error}</p></Card>;
  if (!d) return null;
  const mayEdit = !d.masked && can("payroll.salary.update");

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Payroll details</h2>
        {d.masked ? <Badge tone="neutral">Hidden</Badge>
          : mayEdit && !editing && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>}
      </div>
      {editing ? (
        <DetailsForm d={d} employeeId={employeeId} onDone={(saved) => { setEditing(false); if (saved) load(); }} />
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Row label="Paid by" value={MODE_LABEL[d.payment_mode as Mode] ?? d.payment_mode} />
          <Row label="Bank" value={d.bank_name} />
          <Row label="IBAN" value={d.iban} warn={!d.masked && !!d.iban && !d.iban_valid ? "Check this IBAN" : undefined} />
          <Row label="NTN" value={d.ntn} />
          <Row label="EOBI number" value={d.eobi_number} />
          <Row label="Social security no." value={d.ss_number} />
          {d.current_base_minor != null && <Row label="Current basic" value={money(d.current_base_minor)} />}
          <Row label="Works in" value={d.work_province ?? ""} hint={d.work_province_source} />
        </dl>
      )}
      {d.masked && <p className="text-xs text-fg-muted">Only people with payroll access can see these numbers.</p>}
    </Card>
  );
}

function Row({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="truncate" title={hint || undefined}>{value || <span className="text-fg-subtle">Not set</span>}</dd>
      {warn && <dd className="text-xs text-warning">{warn}</dd>}
    </div>
  );
}

function DetailsForm({ d, employeeId, onDone }: { d: Details; employeeId: string; onDone: (saved: boolean) => void }) {
  const [f, setF] = useState({
    payment_mode: d.payment_mode as Mode, bank_name: d.bank_name, iban: d.iban,
    ntn: d.ntn, eobi_number: d.eobi_number, ss_number: d.ss_number,
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useAction(
    () => api(`/payroll/employees/${employeeId}/details`, { method: "PUT", body: JSON.stringify(f) }),
    { success: "Payroll details saved", failure: "Couldn't save" },
  );
  return (
    <form className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => { e.preventDefault(); if (await save.run()) onDone(true); }}>
      <Field label="Paid by">
        <Select value={f.payment_mode} onChange={set("payment_mode")}>
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
        </Select>
      </Field>
      <Field label="Bank"><Input value={f.bank_name} maxLength={80} onChange={set("bank_name")} /></Field>
      <Field label="IBAN (PK + 22 characters)">
        <Input value={f.iban} maxLength={40} autoComplete="off" onChange={set("iban")} />
      </Field>
      <Field label="NTN"><Input value={f.ntn} maxLength={20} inputMode="numeric" onChange={set("ntn")} /></Field>
      <Field label="EOBI number"><Input value={f.eobi_number} maxLength={30} onChange={set("eobi_number")} /></Field>
      <Field label="Social security no."><Input value={f.ss_number} maxLength={30} onChange={set("ss_number")} /></Field>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={save.busy}>{save.busy ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="ghost" onClick={() => onDone(false)}>Cancel</Button>
      </div>
    </form>
  );
}
