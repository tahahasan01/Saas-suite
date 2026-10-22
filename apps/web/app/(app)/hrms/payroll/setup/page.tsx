"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { monthPKT } from "@/lib/dates";
import { money } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Tabs } from "@/components/Tabs";
import { Combobox } from "@/components/Combobox";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";

type Component = Schema<"ComponentOut">;
type Structure = Schema<"StructureOut">;
type OneOff = Schema<"OneOffOut">;
type Advance = Schema<"AdvanceOut">;
type Statutory = Schema<"StatutoryOut">;
type Employee = { id: string; name: string };

const TABS = [
  { id: "components", label: "Pay components" },
  { id: "structures", label: "Structures" },
  { id: "one-offs", label: "Bonuses & fines" },
  { id: "loans", label: "Loans & advances" },
  { id: "statutory", label: "EOBI & social security" },
];

/** Stored as a fraction (0.01) → "1%". */
const pct = (f: number) => `${Math.round(f * 10000) / 100}%`;

/** Rupees typed by a person → paisa; "" or junk → null. */
const toMinor = (v: string) => (v.trim() && Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) : null);

/** Payroll set-up (wave A, St10): what pay is made of, who gets which
 *  structure, one-off pay, loans and statutory schemes. Each person's salary
 *  is set on their profile. Every write needs its payroll key; reading needs
 *  payroll.run.read. */
export default function PayrollSetup() {
  const [tab, setTab] = useState("components");
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        What pay is made of. Each person&apos;s salary and structure is set on their profile under Staff.
      </p>
      <Tabs items={TABS} value={tab} onChange={setTab} label="Payroll set-up">
        {tab === "components" && <Components />}
        {tab === "structures" && <Structures />}
        {tab === "one-offs" && <OneOffs />}
        {tab === "loans" && <Loans />}
        {tab === "statutory" && <StatutorySchemes />}
      </Tabs>
    </div>
  );
}

/** Load-once list with error and retry, shared by the tabs. */
function useList<T>(path: string) {
  const [rows, setRows] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<T>(path).then(setRows).catch((e) => setError(errorText(e)));
  }, [path]);
  useEffect(load, [load]);
  return { rows, error, load };
}

function useEmployees(): Employee[] {
  const [list, setList] = useState<Employee[]>([]);
  useEffect(() => {
    api<Employee[]>("/hrms/employees", { notify: false }).then(setList).catch(() => setList([]));
  }, []);
  return list;
}

function State({ error, retry, loading }: { error: string | null; retry: () => void; loading: boolean }) {
  if (error) return <ErrorState message={error} onRetry={retry} />;
  if (loading) return <LoadingRows rows={3} />;
  return null;
}

// ── Components ──────────────────────────────────────────────────────────────
function describe(c: Component): string {
  if (c.calc === "fixed") return money(c.amount_minor);
  if (c.calc === "percent") return `${c.percent ?? 0}% of ${c.percent_of}`;
  return c.formula || "formula";
}

function Components() {
  const { rows, error, load } = useList<Component[]>("/payroll/components");
  const blank = { code: "", name: "", kind: "earning", calc: "fixed", amount: "", percent: "", percent_of: "BASE", formula: "", taxable: true };
  const [f, setF] = useState(blank);
  const add = useAction(
    () => api("/payroll/components", { method: "POST", body: JSON.stringify({
      code: f.code, name: f.name, kind: f.kind, calc: f.calc, taxable: f.taxable,
      amount_minor: f.calc === "fixed" ? toMinor(f.amount) ?? 0 : 0,
      percent: f.calc === "percent" ? Number(f.percent || 0) : null,
      percent_of: f.percent_of || "BASE", formula: f.calc === "formula" ? f.formula : "",
    }) }),
    { success: "Component added", failure: "Couldn't add it" },
  );
  const retire = useAction(
    (c: Component) => api(`/payroll/components/${c.id}`, { method: "PATCH", body: JSON.stringify({ active: !c.active }) }),
    { failure: "Couldn't change it" },
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((await add.run()) !== undefined) { setF(blank); load(); }
  }
  return (
    <div className="space-y-4">
      <State error={error} retry={load} loading={!rows} />
      {rows && (rows.length === 0 ? <EmptyState title="No pay components yet" hint="Add allowances and deductions such as House rent or Conveyance." /> : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label="Pay components">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span className="min-w-0">
                <span className="font-medium">{c.name}</span> <span className="font-mono text-xs text-fg-subtle">{c.code}</span>
                <span className="block text-xs text-fg-muted">{c.kind === "earning" ? "Earning" : "Deduction"} · {describe(c)}{c.taxable ? "" : " · not taxed"}</span>
              </span>
              <span className="flex items-center gap-2">
                {!c.active && <Badge>retired</Badge>}
                <Can perm="payroll.settings.manage">
                  <Button size="sm" variant="ghost" disabled={retire.busy} onClick={async () => { if ((await retire.run(c)) !== undefined) load(); }}>
                    {c.active ? "Retire" : "Bring back"}
                  </Button>
                </Can>
              </span>
            </li>
          ))}
        </ul>
      ))}
      <Can perm="payroll.settings.manage">
        <Card>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3" aria-label="Add a pay component">
            <Field label="Name"><Input value={f.name} required maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="House rent" /></Field>
            <Field label="Code"><Input value={f.code} required pattern="[A-Z][A-Z0-9_]*" maxLength={30} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") })} placeholder="HRA" /></Field>
            <Field label="Type">
              <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                <option value="earning">Earning</option><option value="deduction">Deduction</option>
              </Select>
            </Field>
            <Field label="Worked out as">
              <Select value={f.calc} onChange={(e) => setF({ ...f, calc: e.target.value })}>
                <option value="fixed">A fixed amount</option><option value="percent">A % of another amount</option><option value="formula">A formula</option>
              </Select>
            </Field>
            {f.calc === "fixed" && <Field label="Amount (PKR)"><Input type="number" min={0} step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>}
            {f.calc === "percent" && (
              <>
                <Field label="Percent"><Input type="number" min={0} max={1000} step="0.01" value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value })} /></Field>
                <Field label="Of (code)"><Input value={f.percent_of} onChange={(e) => setF({ ...f, percent_of: e.target.value.toUpperCase() })} /></Field>
              </>
            )}
            {f.calc === "formula" && <Field label="Formula"><Input value={f.formula} maxLength={500} onChange={(e) => setF({ ...f, formula: e.target.value })} placeholder="BASE * 0.1" /></Field>}
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={f.taxable} onChange={(e) => setF({ ...f, taxable: e.target.checked })} /> Taxable
            </label>
            <div className="flex items-end sm:col-span-3 sm:justify-end"><Button type="submit" disabled={add.busy}>{add.busy ? "Adding…" : "Add component"}</Button></div>
          </form>
        </Card>
      </Can>
    </div>
  );
}

// ── Structures ──────────────────────────────────────────────────────────────
function Structures() {
  const { rows, error, load } = useList<Structure[]>("/payroll/structures");
  const comps = useList<Component[]>("/payroll/components");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const add = useAction(
    () => api("/payroll/structures", { method: "POST", body: JSON.stringify({ name, component_ids: picked }) }),
    { success: "Structure added", failure: "Couldn't add it" },
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((await add.run()) !== undefined) { setName(""); setPicked([]); load(); }
  }
  const active = (comps.rows ?? []).filter((c) => c.active);
  return (
    <div className="space-y-4">
      <State error={error} retry={load} loading={!rows} />
      {rows && (rows.length === 0 ? <EmptyState title="No structures yet" hint="A structure bundles components, for example Staff or Managers." /> : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label="Structures">
          {rows.map((s) => (
            <li key={s.id} className="px-4 py-2.5">
              <span className="font-medium">{s.name}</span>{!s.active && <> <Badge>off</Badge></>}
              <span className="block text-xs text-fg-muted">{s.components.map((c) => c.name).join(", ") || "Basic only"}</span>
            </li>
          ))}
        </ul>
      ))}
      <Can perm="payroll.settings.manage">
        <Card>
          <form onSubmit={submit} className="space-y-3" aria-label="Add a structure">
            <Field label="Structure name"><Input value={name} required maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Staff" /></Field>
            <fieldset className="flex flex-wrap gap-3 text-sm">
              <legend className="mb-1 text-xs text-fg-muted">Components</legend>
              {active.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={picked.includes(c.id)}
                         onChange={(e) => setPicked(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))} />
                  {c.name}
                </label>
              ))}
              {active.length === 0 && <span className="text-fg-subtle">Add pay components first.</span>}
            </fieldset>
            <div className="flex justify-end"><Button type="submit" disabled={add.busy}>{add.busy ? "Adding…" : "Add structure"}</Button></div>
          </form>
        </Card>
      </Can>
    </div>
  );
}

// ── One-offs ────────────────────────────────────────────────────────────────
function OneOffs() {
  const { rows, error, load } = useList<OneOff[]>("/payroll/one-offs");
  const people = useEmployees();
  const blank = { employee_id: "", month: monthPKT(), name: "", kind: "earning", amount: "", taxable: true };
  const [f, setF] = useState(blank);
  const add = useAction(
    () => api("/payroll/one-offs", { method: "POST", body: JSON.stringify({
      employee_id: f.employee_id, month: f.month, name: f.name, kind: f.kind, amount_minor: toMinor(f.amount) ?? 0, taxable: f.taxable,
    }) }),
    { success: "Added to that month's payroll", failure: "Couldn't add it" },
  );
  const voidIt = useAction((o: OneOff) => api(`/payroll/one-offs/${o.id}/void`, { method: "POST" }), { failure: "Couldn't cancel it" });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((await add.run()) !== undefined) { setF(blank); load(); }
  }
  return (
    <div className="space-y-4">
      <State error={error} retry={load} loading={!rows} />
      {rows && (rows.length === 0 ? <EmptyState title="No bonuses or fines" hint="One-off pay lands in the payroll of the month you pick." /> : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label="Bonuses and fines">
          {rows.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span className="min-w-0"><span className="font-medium">{o.employee_name}</span> · {o.name}
                <span className="block text-xs text-fg-muted">{o.month} · {o.kind === "earning" ? "+" : "−"}{money(o.amount_minor)}</span>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={o.status === "applied" ? "success" : o.status === "void" ? "neutral" : "warning"}>{o.status}</Badge>
                {o.status === "pending" && (
                  <Can perm="payroll.salary.update">
                    <Button size="sm" variant="ghost" disabled={voidIt.busy} onClick={async () => { if ((await voidIt.run(o)) !== undefined) load(); }}>Cancel</Button>
                  </Can>
                )}
              </span>
            </li>
          ))}
        </ul>
      ))}
      <Can perm="payroll.salary.update">
        <Card>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3" aria-label="Add a bonus or fine">
            <Combobox label="Employee" options={people.map((p) => ({ value: p.id, label: p.name }))} value={f.employee_id} onChange={(v) => setF({ ...f, employee_id: v })} />
            <Field label="Month"><Input type="month" value={f.month} required onChange={(e) => setF({ ...f, month: e.target.value })} /></Field>
            <Field label="What for"><Input value={f.name} required maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Eid bonus" /></Field>
            <Field label="Type">
              <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                <option value="earning">Bonus / arrears (added)</option><option value="deduction">Fine / deduction</option>
              </Select>
            </Field>
            <Field label="Amount (PKR)"><Input type="number" min={1} step="0.01" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={f.taxable} onChange={(e) => setF({ ...f, taxable: e.target.checked })} /> Taxable
            </label>
            <div className="flex justify-end sm:col-span-3"><Button type="submit" disabled={add.busy || !f.employee_id}>{add.busy ? "Adding…" : "Add"}</Button></div>
          </form>
        </Card>
      </Can>
    </div>
  );
}

// ── Loans and advances ──────────────────────────────────────────────────────
function Loans() {
  const { rows, error, load } = useList<Advance[]>("/payroll/advances");
  const people = useEmployees();
  const blank = { employee_id: "", principal: "", installment: "", start: monthPKT(), note: "" };
  const [f, setF] = useState(blank);
  const add = useAction(
    () => api("/payroll/advances", { method: "POST", body: JSON.stringify({
      employee_id: f.employee_id, principal_minor: toMinor(f.principal) ?? 0, installment_minor: toMinor(f.installment) ?? 0,
      start_month: f.start, note: f.note,
    }) }),
    { success: "Loan recorded; payroll recovers it each month", failure: "Couldn't record it" },
  );
  const stop = useAction((a: Advance) => api(`/payroll/advances/${a.id}/void`, { method: "POST" }), { failure: "Couldn't stop it" });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((await add.run()) !== undefined) { setF(blank); load(); }
  }
  const months = (a: Advance) => Math.ceil(a.outstanding_minor / Math.max(1, a.installment_minor));
  return (
    <div className="space-y-4">
      <State error={error} retry={load} loading={!rows} />
      {rows && (rows.length === 0 ? <EmptyState title="No loans or advances" hint="Payroll takes the instalment from each month's pay until it's repaid." /> : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label="Loans and advances">
          {rows.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span className="min-w-0"><span className="font-medium">{a.employee_name}</span> · {money(a.principal_minor)}
                <span className="block text-xs text-fg-muted">
                  {money(a.installment_minor)} a month from {a.start_month} · repaid {money(a.recovered_minor)} · left {money(a.outstanding_minor)}
                  {a.status === "active" && a.outstanding_minor > 0 ? ` (about ${months(a)} more month${months(a) === 1 ? "" : "s"})` : ""}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={a.status === "active" ? "brand" : "neutral"}>{a.outstanding_minor === 0 && a.status !== "void" ? "repaid" : a.status}</Badge>
                {a.status === "active" && (
                  <Can perm="payroll.salary.update">
                    <Button size="sm" variant="ghost" disabled={stop.busy} onClick={async () => { if ((await stop.run(a)) !== undefined) load(); }}>Stop recovery</Button>
                  </Can>
                )}
              </span>
            </li>
          ))}
        </ul>
      ))}
      <Can perm="payroll.salary.update">
        <Card>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3" aria-label="Record a loan or advance">
            <Combobox label="Employee" options={people.map((p) => ({ value: p.id, label: p.name }))} value={f.employee_id} onChange={(v) => setF({ ...f, employee_id: v })} />
            <Field label="Amount (PKR)"><Input type="number" min={1} step="0.01" required value={f.principal} onChange={(e) => setF({ ...f, principal: e.target.value })} /></Field>
            <Field label="Monthly instalment (PKR)"><Input type="number" min={1} step="0.01" required value={f.installment} onChange={(e) => setF({ ...f, installment: e.target.value })} /></Field>
            <Field label="First month"><Input type="month" required value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
            <Field label="Note"><Input value={f.note} maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Motorbike loan" /></Field>
            <div className="flex items-end justify-end"><Button type="submit" disabled={add.busy || !f.employee_id}>{add.busy ? "Saving…" : "Record loan"}</Button></div>
          </form>
        </Card>
      </Can>
    </div>
  );
}

// ── Statutory ───────────────────────────────────────────────────────────────
function StatutorySchemes() {
  const { rows, error, load } = useList<Statutory>("/payroll/statutory");
  const [regNo, setRegNo] = useState<Record<string, string>>({});
  const save = useAction(
    (code: string, enabled: boolean, registration_no: string) =>
      api(`/payroll/statutory/${code}`, { method: "PUT", body: JSON.stringify({ enabled, registration_no }) }),
    { success: "Saved", failure: "Couldn't save it" },
  );
  return (
    <div className="space-y-4">
      <State error={error} retry={load} loading={!rows} />
      {rows && !rows.rates_verified && (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
          Some rates aren&apos;t verified against the latest notification yet. Payslips say so until they are.
        </p>
      )}
      {rows && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label="Statutory schemes">
          {rows.schemes.map((s) => {
            const rate = s.rates[0];
            return (
              <li key={s.code} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="font-medium">{s.name}</span> <span className="text-xs text-fg-subtle">{s.authority}{s.province ? ` · ${s.province}` : ""}</span>
                  {rate && <span className="block text-xs text-fg-muted">Employee {pct(rate.employee_rate)} · employer {pct(rate.employer_rate)}{rate.verified ? "" : " · not verified"}</span>}
                </span>
                {s.available ? (
                  <Can perm="payroll.settings.manage" fallback={<Badge tone={s.enabled ? "success" : "neutral"}>{s.enabled ? "on" : "off"}</Badge>}>
                    <span className="flex flex-wrap items-center gap-2">
                      <Input aria-label={`${s.name} registration number`} className="w-40" placeholder="Registration no."
                             value={regNo[s.code] ?? s.registration_no} onChange={(e) => setRegNo({ ...regNo, [s.code]: e.target.value })} />
                      <Button size="sm" variant={s.enabled ? "ghost" : "subtle"} disabled={save.busy}
                              onClick={async () => { if ((await save.run(s.code, !s.enabled, regNo[s.code] ?? s.registration_no)) !== undefined) load(); }}>
                        {s.enabled ? "Turn off" : "Turn on"}
                      </Button>
                    </span>
                  </Can>
                ) : <Badge>not available yet</Badge>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
