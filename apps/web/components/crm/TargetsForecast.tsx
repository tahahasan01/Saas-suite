"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { formatDay, formatMonth, money } from "@/lib/format";
import { monthPKT } from "@/lib/dates";
import { useCan } from "@/lib/can";
import { errorText, useAction } from "@/lib/useAction";
import { Badge, Button, Card, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";

type Target = Schema<"TargetOut">;
type Forecast = Schema<"SalesForecastOut">;
type Bucket = Schema<"ForecastBucket">;
type Person = Schema<"PersonOut">;
type Metric = Target["metric"];

const METRIC: Record<Metric, string> = { won_value: "Won deals", invoiced: "Invoiced", collected: "Collected" };

const thisMonth = () => monthPKT();
const monthLabel = (m: string) => formatMonth(m);
function shiftMonth(m: string, n: number): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Sales targets and the forecast (wave D) on the CRM reports page. */
export function TargetsAndForecast() {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <TargetsCard />
      <ForecastCard />
    </div>
  );
}

function TargetsCard() {
  const can = useCan();
  const manage = can("crm.target.manage");
  const [month, setMonth] = useState(thisMonth);
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [draft, setDraft] = useState({ user_id: "", metric: "won_value" as Metric, amount: "" });

  const load = useCallback(() => {
    setError(null);
    api<{ targets: Target[] }>(`/crm/targets?month=${month}`)
      .then((r) => setTargets(r.targets))
      .catch((e) => setError(errorText(e, "Couldn't load the targets.")));
  }, [month]);
  useEffect(load, [load]);
  useEffect(() => {
    if (manage) api<Person[]>("/crm/assignment/people").then(setPeople).catch(() => setPeople([]));
  }, [manage]);

  const save = useAction(
    () => api("/crm/targets", { method: "PUT", body: JSON.stringify({
      month, metric: draft.metric, user_id: draft.user_id || null, amount_minor: Math.round(Number(draft.amount) * 100),
    }) }),
    { success: "Target saved", failure: "Couldn't save the target" },
  );
  const copy = useAction(
    () => api<{ copied: number }>("/crm/targets/copy", { method: "POST",
      body: JSON.stringify({ from_month: shiftMonth(month, -1), to_month: month }) }),
    { success: (r) => `${(r as { copied: number }).copied} targets copied`, failure: "Couldn't copy the targets" },
  );
  const remove = useAction((id: string) => api(`/crm/targets/${id}`, { method: "DELETE" }),
    { failure: "Couldn't remove the target" });

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold">Targets</h2>
        <span className="flex items-center gap-1">
          <Button size="sm" variant="ghost" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>‹</Button>
          <span className="min-w-36 text-center text-sm font-medium">{monthLabel(month)}</span>
          <Button size="sm" variant="ghost" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>›</Button>
        </span>
      </div>
      {error ? <ErrorState message={error} onRetry={load} /> : !targets ? <LoadingRows rows={2} /> : (
        targets.length === 0 ? <p className="mb-3 text-sm text-fg-subtle">No targets for this month.</p> : (
          <ul className="mb-4 space-y-3">
            {targets.map((t) => {
              const behind = t.achieved_minor < t.pace_minor;
              return (
                <li key={t.id} className="space-y-1 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><span className="font-medium">{t.user_name ?? "Whole company"}</span> · {METRIC[t.metric]}</span>
                    <span className="flex items-center gap-2 tabular-nums">
                      {money(t.achieved_minor)} of {money(t.amount_minor)}
                      <Badge tone={t.percent >= 100 ? "success" : behind ? "warning" : "brand"}>{t.percent}%</Badge>
                      {manage && (
                        <Button size="sm" variant="ghost" aria-label={`Remove target ${t.user_name ?? "company"} ${METRIC[t.metric]}`}
                                onClick={async () => { if (await remove.run(t.id)) load(); }}>×</Button>
                      )}
                    </span>
                  </div>
                  <div className="relative h-2 rounded-full bg-elevated" role="img"
                       aria-label={`${t.percent}% reached; an even pace would be ${money(t.pace_minor)} by today`}>
                    <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.min(100, t.percent)}%` }} />
                    <div className="absolute top-[-2px] h-3 w-0.5 bg-fg"
                         style={{ insetInlineStart: `${Math.min(100, (t.pace_minor * 100) / t.amount_minor)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )
      )}
      {manage && (
        <form className="flex flex-wrap items-end gap-2 border-t border-line pt-3"
              onSubmit={async (e) => { e.preventDefault(); if (await save.run()) { setDraft({ ...draft, amount: "" }); load(); } }}>
          <Field label="Who">
            <Select value={draft.user_id} onChange={(e) => setDraft({ ...draft, user_id: e.target.value })}>
              <option value="">Whole company</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Measure">
            <Select value={draft.metric} onChange={(e) => setDraft({ ...draft, metric: e.target.value as Metric })}>
              {(Object.keys(METRIC) as Metric[]).map((m) => <option key={m} value={m}>{METRIC[m]}</option>)}
            </Select>
          </Field>
          <Field label="Target (PKR)">
            <Input type="number" inputMode="decimal" min={1} step="1" required className="w-32" value={draft.amount}
                   onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
          </Field>
          <Button type="submit" size="sm" disabled={save.busy}>Set target</Button>
          <Button type="button" size="sm" variant="ghost" disabled={copy.busy}
                  onClick={async () => { if (await copy.run()) load(); }}>
            Copy last month
          </Button>
        </form>
      )}
    </Card>
  );
}

function ForecastCard() {
  const [f, setF] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Forecast>("/crm/forecast?months=4").then(setF).catch((e) => setError(errorText(e, "Couldn't load the forecast.")));
  }, []);
  useEffect(load, [load]);
  const months = f?.months.map((b) => b.month!) ?? [];

  return (
    <Card>
      <h2 className="mb-1 font-display text-base font-semibold">Forecast</h2>
      <p className="mb-3 text-sm text-fg-muted">
        Open deals by the month they should close. Weighted is value × probability; best case is if they all close.
      </p>
      {error ? <ErrorState message={error} onRetry={load} /> : !f ? <LoadingRows rows={3} /> : (
        <table className="w-full text-sm">
          <caption className="sr-only">Forecast by month</caption>
          <thead>
            <tr className="text-xs text-fg-subtle">
              <th scope="col" className="py-1 text-start font-medium">Month</th>
              <th scope="col" className="py-1 text-end font-medium">Won</th>
              <th scope="col" className="py-1 text-end font-medium">Weighted</th>
              <th scope="col" className="py-1 text-end font-medium">Best case</th>
            </tr>
          </thead>
          <tbody>
            {f.months.map((b) => <Row key={b.month} label={monthLabel(b.month!)} b={b} months={months} onMoved={load} />)}
            <Row label="Overdue" b={f.overdue} warn months={months} onMoved={load} />
            <Row label="No close date" b={f.no_date} months={months} onMoved={load} />
          </tbody>
        </table>
      )}
    </Card>
  );
}

/** The deal's close date moved into `month` (YYYY-MM): same day, or the
 *  month's last day when the month is shorter. */
function inMonth(date: string | null | undefined, month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const day = Math.min(date ? Number(date.slice(8, 10)) : 15, last);
  return `${month}-${String(day).padStart(2, "0")}`;
}

function Row({ label, b, warn, months, onMoved }: {
  label: string; b: Bucket; warn?: boolean; months: string[]; onMoved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const can = useCan();
  const move = useAction(
    (id: string, close: string) => api(`/crm/leads/${id}`, { method: "PATCH", body: JSON.stringify({ expected_close_date: close }) }),
    { success: "Close date moved", failure: "Couldn't move the deal" },
  );
  return (
    <>
      <tr className="border-t border-line tabular-nums">
        <th scope="row" className="py-1.5 text-start font-normal">
          {b.open_count > 0 ? (
            <button type="button" className="text-start hover:underline" aria-expanded={open} onClick={() => setOpen(!open)}>
              {label} <span className="text-xs text-fg-subtle">({b.open_count})</span>
            </button>
          ) : label}
          {warn && b.open_count > 0 && <Badge tone="warning">Update dates</Badge>}
        </th>
        <td className="py-1.5 text-end">{b.won_minor ? money(b.won_minor) : "—"}</td>
        <td className="py-1.5 text-end">{money(b.weighted_minor)}</td>
        <td className="py-1.5 text-end">{money(b.best_case_minor)}</td>
      </tr>
      {open && (b.deals ?? []).map((d) => (
        <tr key={d.id} className="text-xs text-fg-muted">
          <td className="py-0.5 ps-4">{d.name}</td>
          <td className="py-0.5 text-end">
            {can("crm.lead.update") ? (
              <Select aria-label={`Move ${d.name} to month`} className="w-32 py-0.5 text-xs" disabled={move.busy}
                      value={d.expected_close_date?.slice(0, 7) ?? ""}
                      onChange={async (e) => { if (e.target.value && await move.run(d.id, inMonth(d.expected_close_date, e.target.value))) onMoved(); }}>
                <option value="">{d.expected_close_date ? formatDay(d.expected_close_date) : "No date"}</option>
                {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </Select>
            ) : (d.expected_close_date ? formatDay(d.expected_close_date) : "")}
          </td>
          <td className="py-0.5 text-end">{money(d.weighted_minor)}</td>
          <td className="py-0.5 text-end">{money(d.value_minor)}</td>
        </tr>
      ))}
    </>
  );
}
