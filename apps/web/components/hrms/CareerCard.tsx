"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Can, useCan } from "@/lib/can";
import { dayPKT } from "@/lib/dates";
import { formatDay, money } from "@/lib/format";
import { useAction } from "@/lib/useAction";
import { Combobox } from "@/components/Combobox";
import { Dialog } from "@/components/Dialog";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

type Change = Schema<"JobChangeOut">;
type Named = { id: string; name: string; active?: boolean };

const KINDS: Record<string, string> = { promotion: "Promotion", transfer: "Transfer", demotion: "Demotion", change: "Job change" };

function moves(c: Change): string[] {
  const pairs: [string | null | undefined, string | null | undefined, string][] = [
    [c.from_title, c.to_title, "title"], [c.from_department, c.to_department, "department"],
    [c.from_location, c.to_location, "site"], [c.from_manager, c.to_manager, "manager"],
  ];
  const out = pairs.filter(([, to]) => to).map(([from, to, what]) => `${what}: ${from || "—"} → ${to}`);
  if (c.new_base_minor != null) out.push(`salary: ${c.old_base_minor != null ? money(c.old_base_minor) : "—"} → ${money(c.new_base_minor)}`);
  return out;
}

/** Promotions and transfers on the profile (wave C, H30): the history, and a new one. */
export function CareerCard({ employeeId, onChanged }: { employeeId: string; onChanged: () => void }) {
  const [rows, setRows] = useState<Change[] | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => {
    api<Change[]>(`/hrms/employees/${employeeId}/job-changes`, { notify: false }).then(setRows).catch(() => setRows([]));
  }, [employeeId]);
  useEffect(load, [load]);
  const cancel = useAction((c: Change) => api(`/hrms/job-changes/${c.id}/cancel`, { method: "POST" }), { failure: "Couldn't cancel it" });
  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Career</h2>
        <Can perm="hrms.employee.update"><Button size="sm" variant="ghost" onClick={() => setAdding(true)}>Promote or transfer</Button></Can>
      </div>
      {rows === null ? null : rows.length === 0 ? <p className="text-sm text-fg-muted">No promotions or transfers yet.</p> : (
        <ul className="space-y-2 text-sm" aria-label="Career history">
          {rows.map((c) => (
            <li key={c.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{KINDS[c.kind]} · {formatDay(c.effective_on)}</span>
                <span className="flex items-center gap-1.5">
                  {c.status !== "applied" && <Badge tone={c.status === "scheduled" ? "brand" : "neutral"}>{c.status}</Badge>}
                  {c.status === "scheduled" && <Can perm="hrms.employee.update">
                    <Button size="sm" variant="ghost" disabled={cancel.busy} onClick={async () => { if ((await cancel.run(c)) !== undefined) load(); }}>Cancel</Button>
                  </Can>}
                </span>
              </div>
              <p className="text-xs text-fg-muted">{moves(c).join(" · ")}{c.note ? ` · ${c.note}` : ""}</p>
            </li>
          ))}
        </ul>
      )}
      {adding && <ChangeDialog employeeId={employeeId} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); onChanged(); }} />}
    </Card>
  );
}

function ChangeDialog({ employeeId, onClose, onDone }: { employeeId: string; onClose: () => void; onDone: () => void }) {
  const can = useCan();
  const [titles, setTitles] = useState<Named[]>([]);
  const [depts, setDepts] = useState<Named[]>([]);
  const [locs, setLocs] = useState<Named[]>([]);
  const [people, setPeople] = useState<Named[]>([]);
  const [f, setF] = useState({ kind: "promotion", effective_on: dayPKT(), job_title_id: "", department_id: "", location_id: "", manager_id: "", salary: "", note: "" });
  useEffect(() => {
    api<Named[]>("/hrms/job-titles", { notify: false }).then(setTitles).catch(() => setTitles([]));
    api<Named[]>("/hrms/departments", { notify: false }).then(setDepts).catch(() => setDepts([]));
    api<Named[]>("/hrms/locations", { notify: false }).then(setLocs).catch(() => setLocs([]));
    api<Named[]>("/hrms/employees", { notify: false }).then((p) => setPeople(p.filter((x) => x.id !== employeeId))).catch(() => setPeople([]));
  }, [employeeId]);
  const save = useAction(() => api<Change>(`/hrms/employees/${employeeId}/job-changes`, { method: "POST", body: JSON.stringify({
    kind: f.kind, effective_on: f.effective_on, note: f.note,
    job_title_id: f.job_title_id || null, department_id: f.department_id || null, location_id: f.location_id || null,
    manager_id: f.manager_id || null, new_base_minor: f.salary ? Math.round(Number(f.salary) * 100) : null,
  }) }), { success: "Saved", failure: "Couldn't save it" });
  const any = f.job_title_id || f.department_id || f.location_id || f.manager_id || f.salary;
  const pick = (label: string, key: "job_title_id" | "department_id" | "location_id", list: Named[]) => (
    <Field label={label}>
      <Select value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })}>
        <option value="">No change</option>
        {list.filter((x) => x.active !== false).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </Select>
    </Field>
  );
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title="Promote or transfer">
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await save.run()) onDone(); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What">
            <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              {Object.entries(KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="From"><Input type="date" required value={f.effective_on} onChange={(e) => setF({ ...f, effective_on: e.target.value })} /></Field>
          {pick("New job title", "job_title_id", titles)}
          {pick("New department", "department_id", depts)}
          {pick("New site", "location_id", locs)}
          {can("payroll.salary.update") && (
            <Field label="New monthly salary (PKR)"><Input type="number" min={1} step="1" value={f.salary} onChange={(e) => setF({ ...f, salary: e.target.value })} /></Field>
          )}
        </div>
        {can("hrms.org.manage") && (
          <Combobox label="New manager" options={people.map((p) => ({ value: p.id, label: p.name }))} value={f.manager_id} onChange={(v) => setF({ ...f, manager_id: v })} />
        )}
        <Field label="Note"><Input value={f.note} maxLength={1000} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <p className="text-xs text-fg-muted">Dated today or earlier, it applies now; a later date applies on the day.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.busy || !any}>Save</Button>
        </div>
      </form>
    </Dialog>
  );
}
