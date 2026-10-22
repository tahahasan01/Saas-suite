"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { formatDay, formatMonth, money } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Select, Switch } from "@/components/ui";

type Settlement = Schema<"SettlementOut">;
type Line = Schema<"SettlementLineOut">;
type Boarding = Schema<"BoardingOut">;
type Gratuity = Schema<"GratuitySettingsOut">;

const TONE = { draft: "brand", approved: "warning", paid: "success", cancelled: "neutral" } as const;
const ADDABLE: Record<string, [string, string][]> = {
  payable: [["NOTICE_PAY", "Notice pay"], ["BONUS", "Bonus"], ["GRATUITY", "Gratuity (by hand)"], ["OTHER", "Other"]],
  receivable: [["NOTICE_SHORTFALL", "Notice not served"], ["OTHER_RECOVERY", "Other recovery"]],
};

/** Leavers' final settlements (wave C, H12): what the company owes and
 *  recovers, booked onto the last payslip; and the gratuity rule. */
export default function SettlementsPage() {
  const [rows, setRows] = useState<Settlement[] | null>(null);
  const [leavers, setLeavers] = useState<Boarding[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Settlement[]>("/hrms/final-settlements").then(setRows).catch((e) => setError(errorText(e)));
    api<Boarding[]>("/hrms/boardings?kind=offboarding", { notify: false }).then(setLeavers).catch(() => setLeavers([]));
  }, []);
  useEffect(load, [load]);
  const start = useAction((employeeId: string) => api<Settlement>(`/hrms/employees/${employeeId}/final-settlement`, { method: "POST" }),
                          { failure: "Couldn't start the settlement" });
  const settled = new Set((rows ?? []).filter((s) => s.status !== "cancelled").map((s) => s.employee_id));
  const waiting = leavers.filter((b) => b.status !== "cancelled" && !settled.has(b.employee_id));

  return (
    <div className="space-y-5">
      <GratuityCard />
      {waiting.length > 0 && (
        <section aria-labelledby="waiting-h" className="space-y-2">
          <h2 id="waiting-h" className="font-display text-lg font-semibold">Leaving, not settled yet</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label="Leavers without a settlement">
            {waiting.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span><span className="font-medium">{b.employee_name}</span>
                  <span className="block text-xs text-fg-muted">last day {formatDay(b.last_working_day!)}</span></span>
                <Can perm="payroll.settlement.manage">
                  <Button size="sm" variant="subtle" disabled={start.busy} aria-label={`Start settlement for ${b.employee_name}`}
                          onClick={async () => { const s = await start.run(b.employee_id); if (s) { load(); setOpenId(s.id); } }}>Work it out</Button>
                </Can>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="settlements-h" className="space-y-2">
        <h2 id="settlements-h" className="font-display text-lg font-semibold">Settlements</h2>
        {error ? <ErrorState message={error} onRetry={load} /> : rows === null ? <LoadingRows rows={2} /> : rows.length === 0 ? (
          <EmptyState title="No settlements yet" hint="Record someone's leaving on their profile first; they then show above." />
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label="Settlements">
            {rows.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setOpenId(s.id)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-start hover:bg-elevated">
                  <span><span className="font-medium">{s.employee_name}</span>
                    <span className="block text-xs text-fg-muted">last day {formatDay(s.last_working_day)}{s.pay_month ? ` · paid with ${formatMonth(s.pay_month.slice(0, 7))} salary` : ""}</span></span>
                  <span className="flex items-center gap-2"><span className="tabular-nums">{money(s.net_minor)}</span><Badge tone={TONE[s.status]}>{s.status}</Badge></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {openId && <SettlementDialog id={openId} onClose={() => { setOpenId(null); load(); }} />}
    </div>
  );
}

function GratuityCard() {
  const [g, setG] = useState<Gratuity | null>(null);
  useEffect(() => { api<Gratuity>("/payroll/gratuity-settings", { notify: false }).then(setG).catch(() => setG(null)); }, []);
  const save = useAction((next: Gratuity) => api<Gratuity>("/payroll/gratuity-settings", { method: "PUT", body: JSON.stringify(next) }),
                         { success: "Gratuity rule saved", failure: "Couldn't save it" });
  if (!g) return null;
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Gratuity</h2>
        {!g.verified && <Badge tone="warning">rule not yet verified</Badge>}
      </div>
      <form aria-label="Gratuity rule" className="grid gap-3 sm:grid-cols-4"
            onSubmit={async (e) => { e.preventDefault(); const r = await save.run(g); if (r) setG(r); }}>
        <div className="self-end sm:col-span-4"><Switch checked={g.enabled ?? false} onChange={(v) => setG({ ...g, enabled: v })} label="This company pays gratuity" /></div>
        <Field label="Days' pay per year"><Input type="number" min={1} max={60} value={g.days_per_year} onChange={(e) => setG({ ...g, days_per_year: Number(e.target.value) })} /></Field>
        <Field label="Minimum service (months)"><Input type="number" min={0} max={120} value={g.min_service_months} onChange={(e) => setG({ ...g, min_service_months: Number(e.target.value) })} /></Field>
        <Field label="Part year counts after (months)"><Input type="number" min={0} max={11} value={g.part_year_months} onChange={(e) => setG({ ...g, part_year_months: Number(e.target.value) })} /></Field>
        <Can perm="payroll.settings.manage"><div className="flex items-end"><Button type="submit" variant="subtle" disabled={save.busy}>Save</Button></div></Can>
      </form>
      <p className="text-xs text-fg-muted">On the last basic salary: 30 days a year is one month's salary for each year worked. Check this against your company's rule before relying on it.</p>
    </Card>
  );
}

function SettlementDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [s, setS] = useState<Settlement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Settlement>(`/hrms/final-settlements/${id}`).then(setS).catch((e) => setError(errorText(e)));
  }, [id]);
  useEffect(load, [load]);
  const act = useAction((what: "approve" | "recalculate" | "cancel") => api<Settlement>(`/hrms/final-settlements/${id}/${what}`, { method: "POST" }),
                        { failure: "Couldn't do that" });
  const drop = useAction((ln: Line) => api(`/hrms/final-settlement-lines/${ln.id}`, { method: "DELETE" }), { failure: "Couldn't remove it" });
  const draft = s?.status === "draft";
  async function run(what: "approve" | "recalculate" | "cancel") { const r = await act.run(what); if (r) setS(r); }
  const side = (kind: string) => (s?.lines ?? []).filter((l) => l.kind === kind);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={s ? `Final settlement: ${s.employee_name}` : "Final settlement"} size="lg">
      {error ? <ErrorState message={error} onRetry={load} /> : !s ? <LoadingRows rows={4} /> : (
        <div className="space-y-4 text-sm">
          <p className="text-fg-muted">
            {s.join_date ? `Joined ${formatDay(s.join_date)} · ` : ""}last day {formatDay(s.last_working_day)}
            {s.service_years ? ` · ${s.service_years} year(s) counted for gratuity` : ""} ·{" "}
            <Link href={`/hrms/employees/${s.employee_id}`} className="text-brand hover:underline">Profile</Link>
          </p>
          {!s.gratuity_verified && side("payable").some((l) => l.code === "GRATUITY") && (
            <p role="status" className="rounded-lg bg-warning-subtle px-3 py-2 text-warning">Gratuity uses a rule nobody has verified yet.</p>
          )}
          {(s.assets_held ?? []).length > 0 && (
            <p role="status" className="rounded-lg bg-warning-subtle px-3 py-2 text-warning">
              Still holding: {(s.assets_held ?? []).map((a) => a.name).join(", ")}. Take them back on Assets, or charge them (an asset with a value is charged when you recalculate).
            </p>
          )}
          {(["payable", "receivable"] as const).map((kind) => (
            <section key={kind} aria-labelledby={`${kind}-h`} className="space-y-1">
              <h3 id={`${kind}-h`} className="font-semibold">{kind === "payable" ? "The company pays" : "The company recovers"}</h3>
              <ul className="divide-y divide-line rounded-lg border border-line" aria-label={kind === "payable" ? "Payables" : "Receivables"}>
                {side(kind).length === 0 && <li className="px-3 py-2 text-fg-muted">Nothing.</li>}
                {side(kind).map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>{l.name}{l.taxable ? <span className="ms-1.5 text-xs text-fg-muted">taxed</span> : null}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{money(l.amount_minor)}</span>
                      {draft && <Can perm="payroll.settlement.manage"><Button size="sm" variant="ghost" disabled={drop.busy} aria-label={`Remove ${l.name}`}
                                  onClick={async () => { if ((await drop.run(l)) !== undefined) load(); }}>Remove</Button></Can>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="flex justify-between border-t border-line pt-2 font-semibold">
            <span>{s.net_minor >= 0 ? "Net to pay them" : "They owe the company"}</span>
            <span className="tabular-nums">{money(Math.abs(s.net_minor))}</span>
          </p>
          <p className="text-xs text-fg-muted">Income tax is worked out on the payslip that carries this.</p>
          {draft && <Can perm="payroll.settlement.manage"><AddLine id={s.id} onAdded={load} /></Can>}
          {s.pay_month && <p role="status">Booked on the {formatMonth(s.pay_month.slice(0, 7))} payroll{s.status === "paid" ? " and paid." : ": it's paid when that run is."}</p>}
          {draft && (
            <Can perm="payroll.settlement.manage">
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" disabled={act.busy} onClick={() => void run("cancel")}>Cancel</Button>
                <Button variant="subtle" disabled={act.busy} onClick={() => void run("recalculate")}>Recalculate</Button>
                <Button disabled={act.busy} onClick={() => void run("approve")}>Approve and book on payroll</Button>
              </div>
            </Can>
          )}
        </div>
      )}
    </Dialog>
  );
}

function AddLine({ id, onAdded }: { id: string; onAdded: () => void }) {
  const [kind, setKind] = useState<"payable" | "receivable">("payable");
  const [code, setCode] = useState("NOTICE_PAY");
  const [name, setName] = useState("Notice pay");
  const [amount, setAmount] = useState("");
  const add = useAction(() => api(`/hrms/final-settlements/${id}/lines`, { method: "POST", body: JSON.stringify({
    kind, code, name, amount_minor: Math.round(Number(amount) * 100) }) }), { failure: "Couldn't add it" });
  return (
    <form aria-label="Add a line" className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => { e.preventDefault(); if ((await add.run()) !== undefined) { setAmount(""); onAdded(); } }}>
      <Field label="Side">
        <Select value={kind} onChange={(e) => { const k = e.target.value as "payable" | "receivable"; setKind(k); setCode(ADDABLE[k][0][0]); setName(ADDABLE[k][0][1]); }}>
          <option value="payable">Pay them</option><option value="receivable">Recover</option>
        </Select>
      </Field>
      <Field label="What">
        <Select value={code} onChange={(e) => { setCode(e.target.value); setName(ADDABLE[kind].find(([c]) => c === e.target.value)![1]); }}>
          {ADDABLE[kind].map(([c, l]) => <option key={c} value={c}>{l}</option>)}
        </Select>
      </Field>
      <div className="min-w-40 flex-1"><Field label="Shown as"><Input value={name} maxLength={120} required onChange={(e) => setName(e.target.value)} /></Field></div>
      <div className="w-32"><Field label="Amount (PKR)"><Input type="number" min={0.01} step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></Field></div>
      <Button type="submit" variant="subtle" disabled={add.busy || !(Number(amount) > 0)}>Add</Button>
    </form>
  );
}
