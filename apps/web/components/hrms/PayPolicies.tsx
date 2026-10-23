"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { useCan } from "@/lib/can";
import { useAction } from "@/lib/useAction";
import { useConfirm } from "@/components/Confirm";
import { Badge, Button, Card, ErrorState, Field, Input, LoadingRows, Select, Switch } from "@/components/ui";

type Policies = Schema<"PoliciesOut">;
type Preset = Schema<"PresetOut">;
type Gratuity = Schema<"GratuitySettingsOut">;
type Rates = Schema<"OvertimeRatesOut">;

/** Every pay rule that differs between companies, in one place (0112): a
 *  preset to start from, then each field as the company needs it. Saved
 *  rules apply from now on; past payslips and settlements keep theirs. */
export function PayPolicies() {
  const can = useCan();
  const edit = can("payroll.settings.manage");
  const confirm = useConfirm();
  const [p, setP] = useState<Policies | null>(null);
  const [g, setG] = useState<Gratuity | null>(null);
  const [r, setR] = useState<Rates | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [limit, setLimit] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([
      api<Policies>("/payroll/policies"), api<Gratuity>("/payroll/gratuity-settings"),
      api<Rates>("/hrms/overtime-rates"), api<Preset[]>("/payroll/policy-presets"),
    ]).then(([pp, gg, rr, pr]) => {
      setP(pp); setG(gg); setR(rr); setPresets(pr);
      setLimit(pp.gratuity_exempt_minor ? String(pp.gratuity_exempt_minor / 100) : "");
    }).catch(() => setError("Couldn't load the pay policies."));
  }, []);
  useEffect(load, [load]);

  const apply = useAction((key: string) => api<Policies>("/payroll/policies/apply-preset", { method: "POST", body: JSON.stringify({ preset: key }) }),
                          { success: "Preset applied: check each rule below", failure: "Couldn't apply the preset" });
  const save = useAction(async () => {
    await api("/payroll/gratuity-settings", { method: "PUT", body: JSON.stringify(g) });
    await api("/hrms/overtime-rates", { method: "PUT", body: JSON.stringify({ normal: r!.normal, rest_day: r!.rest_day, holiday: r!.holiday }) });
    return api<Policies>("/payroll/policies", { method: "PUT", body: JSON.stringify({
      encash_basis: p!.encash_basis, gratuity_tax: p!.gratuity_tax,
      gratuity_exempt_minor: p!.gratuity_tax === "exempt_up_to" ? Math.round(Number(limit) * 100) : null,
      paid_on_leaving_ids: p!.leave_types.filter((t) => t.paid_on_leaving).map((t) => t.id),
      pf_enabled: p!.pf_enabled, pf_employee_rate: p!.pf_employee_rate, pf_employer_rate: p!.pf_employer_rate,
      pf_base: p!.pf_base, pf_vesting_months: p!.pf_vesting_months,
    }) });
  }, { success: "Pay policies saved", failure: "Couldn't save the pay policies" });

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!p || !g || !r) return <LoadingRows rows={4} label="Loading pay policies" />;

  async function choosePreset(pr: Preset) {
    const done = await confirm({
      title: `Use “${pr.name}”?`, body: "This replaces the rules below with the preset's. You can change any of them after.",
      confirmLabel: "Use preset", busyLabel: "Applying…", run: () => apply.run(pr.key),
    });
    if (done) {
      setP(null);      // the form comes back with the preset's rules, so nobody edits the old ones meanwhile
      load();
    }
  }
  const num = (v: string) => Number(v);

  return (
    <div className="space-y-4">
      <section aria-labelledby="presets-h" className="space-y-2">
        <h2 id="presets-h" className="text-sm font-semibold">Start from a preset</h2>
        <ul className="grid gap-2 sm:grid-cols-3" aria-label="Presets">
          {presets.map((pr) => (
            <li key={pr.key}>
              <Card className="flex h-full flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{pr.name}</span>
                  {p.preset === pr.key && <Badge tone="brand">in use</Badge>}
                </div>
                <p className="flex-1 text-xs text-fg-muted">{pr.summary}</p>
                {edit && <Button size="sm" variant="subtle" disabled={apply.busy} onClick={() => void choosePreset(pr)} aria-label={`Use ${pr.name}`}>Use this</Button>}
              </Card>
            </li>
          ))}
        </ul>
        <p className="text-xs text-fg-muted">Presets are starting points to check against your own rules and the law, not advice.</p>
      </section>

      <form aria-label="Pay policies" className="space-y-4" onSubmit={async (e) => { e.preventDefault(); const next = await save.run(); if (next) load(); }}>
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">Gratuity</h2>
          <Switch checked={g.enabled ?? false} onChange={(v) => setG({ ...g, enabled: v })} label="This company pays gratuity" disabled={!edit} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Days' pay per year"><Input type="number" min={1} max={60} disabled={!edit} value={g.days_per_year} onChange={(e) => setG({ ...g, days_per_year: num(e.target.value) })} /></Field>
            <Field label="Minimum service (months)"><Input type="number" min={0} max={120} disabled={!edit} value={g.min_service_months} onChange={(e) => setG({ ...g, min_service_months: num(e.target.value) })} /></Field>
            <Field label="Part year counts after (months)"><Input type="number" min={0} max={11} disabled={!edit} value={g.part_year_months} onChange={(e) => setG({ ...g, part_year_months: num(e.target.value) })} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Income tax on gratuity">
              <Select value={p.gratuity_tax} disabled={!edit} onChange={(e) => setP({ ...p, gratuity_tax: e.target.value as Policies["gratuity_tax"] })}>
                <option value="taxed">Taxed like salary</option><option value="exempt">Tax-free</option><option value="exempt_up_to">Tax-free up to a limit</option>
              </Select>
            </Field>
            {p.gratuity_tax === "exempt_up_to" && (
              <Field label="Tax-free limit (PKR)"><Input type="number" min={1} required disabled={!edit} value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
            )}
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">Provident fund</h2>
          <Switch checked={p.pf_enabled ?? false} onChange={(v) => setP({ ...p, pf_enabled: v })} label="This company runs a provident fund" disabled={!edit} />
          {p.pf_enabled && (
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Employee pays (%)"><Input type="number" min={0} max={30} step="0.01" disabled={!edit} value={p.pf_employee_rate ?? 0} onChange={(e) => setP({ ...p, pf_employee_rate: num(e.target.value) })} /></Field>
              <Field label="Company pays (%)"><Input type="number" min={0} max={30} step="0.01" disabled={!edit} value={p.pf_employer_rate ?? 0} onChange={(e) => setP({ ...p, pf_employer_rate: num(e.target.value) })} /></Field>
              <Field label="Of">
                <Select value={p.pf_base ?? "basic"} disabled={!edit} onChange={(e) => setP({ ...p, pf_base: e.target.value as Policies["pf_base"] })}>
                  <option value="basic">Basic pay</option><option value="gross">Gross pay</option>
                </Select>
              </Field>
              <Field label="Company share theirs after (months)"><Input type="number" min={0} max={240} disabled={!edit} value={p.pf_vesting_months ?? 0} onChange={(e) => setP({ ...p, pf_vesting_months: num(e.target.value) })} /></Field>
            </div>
          )}
          {p.pf_enabled && <p className="text-xs text-fg-muted">Payroll takes the employee's share and records the company's for each member. A leaver's fund is paid out in their final settlement.</p>}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">Overtime rates</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {([["Ordinary day", "normal"], ["Weekly day off", "rest_day"], ["Public holiday", "holiday"]] as const).map(([label, key]) => (
              <Field key={key} label={`${label} (×)`}><Input type="number" min={1} max={5} step="0.25" disabled={!edit} value={r[key]} onChange={(e) => setR({ ...r, [key]: num(e.target.value) })} /></Field>
            ))}
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">Leave paid out</h2>
          <Field label="One day of leave is worth">
            <Select value={p.encash_basis} disabled={!edit} onChange={(e) => setP({ ...p, encash_basis: e.target.value as Policies["encash_basis"] })}>
              <option value="days_30">The monthly salary ÷ 30</option><option value="days_26">The monthly salary ÷ 26</option>
              <option value="working_days">The monthly salary ÷ that month's working days</option>
            </Select>
          </Field>
          <fieldset className="space-y-1.5 text-sm">
            <legend className="mb-1 text-xs text-fg-muted">Paid out in the final settlement when someone leaves</legend>
            {p.leave_types.map((t) => (
              <label key={t.id} className="flex items-center gap-2">
                <input type="checkbox" disabled={!edit} checked={t.paid_on_leaving}
                       onChange={(e) => setP({ ...p, leave_types: p.leave_types.map((x) => (x.id === t.id ? { ...x, paid_on_leaving: e.target.checked } : x)) })} />
                {t.name}
              </label>
            ))}
          </fieldset>
        </Card>

        {edit && <div className="flex justify-end"><Button type="submit" disabled={save.busy}>{save.busy ? "Saving…" : "Save pay policies"}</Button></div>}
        <p className="text-xs text-fg-muted">New rules apply from now on. Payslips and settlements already made keep the numbers they were made with.</p>
      </form>
    </div>
  );
}
