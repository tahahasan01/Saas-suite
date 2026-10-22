"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { dayPKT } from "@/lib/dates";
import { formatDay, money } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Button, Card, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";

type Comp = Schema<"CompensationOut">;
type Structure = Schema<"StructureOut">;

const REASONS: Record<string, string> = {
  joining: "Joining", increment: "Increment", promotion: "Promotion", correction: "Correction", adjustment: "Adjustment",
};

/** An employee's salary over time (D-40): each change is a new dated row,
 *  never an edit, so a locked payslip can't move. Reading needs
 *  payroll.salary.read; a change needs payroll.salary.update. */
export function SalaryCard({ employeeId }: { employeeId: string }) {
  const [rows, setRows] = useState<Comp[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [structures, setStructures] = useState<Structure[]>([]);
  const [f, setF] = useState({ base: "", effective_from: dayPKT(), reason: "increment", structure_id: "", note: "" });

  const load = useCallback(() => {
    setError(null);
    api<Comp[]>(`/payroll/employees/${employeeId}/compensation`).then(setRows).catch((e) => setError(errorText(e)));
  }, [employeeId]);
  useEffect(load, [load]);
  useEffect(() => {
    api<Structure[]>("/payroll/structures", { notify: false }).then((s) => setStructures(s.filter((x) => x.active))).catch(() => setStructures([]));
  }, []);

  const save = useAction(
    () => api(`/payroll/employees/${employeeId}/compensation`, { method: "POST", body: JSON.stringify({
      base_minor: Math.round(Number(f.base) * 100), effective_from: f.effective_from, reason: f.reason,
      structure_id: f.structure_id || null, note: f.note,
    }) }),
    { success: "Salary saved", failure: "Couldn't save the salary" },
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((await save.run()) !== undefined) { setF({ ...f, base: "", note: "" }); load(); }
  }

  const current = rows?.find((r) => r.effective_from <= dayPKT()) ?? rows?.[rows.length - 1];
  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold">Salary</h2>
      {error ? <ErrorState message={error} onRetry={load} /> : rows === null ? <LoadingRows rows={2} /> : (
        <>
          {current ? (
            <p className="text-sm">
              <span className="text-lg font-semibold tabular-nums" data-testid="current-salary">{money(current.base_minor)}</span> a month
              {current.structure_name && <span className="text-fg-muted"> · {current.structure_name}</span>}
            </p>
          ) : <p className="text-sm text-fg-muted">No salary set yet. Payroll skips this person until there is one.</p>}
          {rows.length > 0 && (
            <ul className="divide-y divide-line text-xs" aria-label="Salary history">
              {rows.map((r) => (
                <li key={r.id} className="flex justify-between gap-2 py-1.5">
                  <span>{formatDay(r.effective_from)} · {REASONS[r.reason] ?? r.reason}{r.note ? ` · ${r.note}` : ""}</span>
                  <span className="tabular-nums">{money(r.base_minor)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Can perm="payroll.salary.update">
        <form onSubmit={submit} className="grid gap-2 sm:grid-cols-2" aria-label="Change salary">
          <Field label="Monthly salary (PKR)"><Input type="number" min={0} step="0.01" required value={f.base} onChange={(e) => setF({ ...f, base: e.target.value })} /></Field>
          <Field label="From"><Input type="date" required value={f.effective_from} onChange={(e) => setF({ ...f, effective_from: e.target.value })} /></Field>
          <Field label="Reason">
            <Select value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}>
              {Object.entries(REASONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Structure">
            <Select value={f.structure_id} onChange={(e) => setF({ ...f, structure_id: e.target.value })}>
              <option value="">Basic only</option>
              {structures.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={save.busy}>{save.busy ? "Saving…" : "Save salary"}</Button></div>
        </form>
      </Can>
    </Card>
  );
}
