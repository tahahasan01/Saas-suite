"use client";

import { useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { formatMonth } from "@/lib/format";
import { errorText } from "@/lib/useAction";
import { EXIT_REASONS } from "@/components/hrms/Boarding";
import { Card, ErrorState, LoadingRows } from "@/components/ui";

type Analytics = Schema<"HrAnalytics">;

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="font-display text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-fg-subtle">{hint}</p>}
    </Card>
  );
}

/** Staff numbers for the last 12 months (wave C, H39): headcount, who
 *  joined and left, attrition, absenteeism, why people left, departments. */
export function HrAnalyticsSection() {
  const [a, setA] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Analytics>("/hrms/analytics").then(setA).catch((e) => setError(errorText(e))); }, []);
  if (error) return <ErrorState message={error} />;
  if (!a) return <LoadingRows rows={3} label="Loading staff numbers" />;
  const reasons = Object.entries(a.leaving_reasons ?? {}).sort((x, y) => y[1] - x[1]);
  return (
    <section aria-labelledby="hr-analytics-h" className="mb-8 space-y-4">
      <h2 id="hr-analytics-h" className="font-display text-lg font-semibold">Staff numbers, last 12 months</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label="On staff now" value={String(a.headcount_now)} />
        <Tile label="Joined" value={String(a.joiners)} />
        <Tile label="Left" value={String(a.leavers)} />
        <Tile label="Attrition" value={`${a.attrition_pct}%`} hint="left ÷ average staff" />
        <Tile label="Absenteeism" value={a.absenteeism_pct == null ? "—" : `${a.absenteeism_pct}%`}
              hint={a.absenteeism_month ? `absent days, ${formatMonth(a.absenteeism_month)}` : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm" aria-label="Staff by month">
            <thead className="text-xs text-fg-muted">
              <tr><th className="px-3 py-2 text-start font-medium">Month</th><th className="px-3 py-2 text-end font-medium">On staff</th>
                <th className="px-3 py-2 text-end font-medium">Joined</th><th className="px-3 py-2 text-end font-medium">Left</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {a.months.map((m) => (
                <tr key={m.month}>
                  <td className="px-3 py-1.5">{formatMonth(m.month)}</td>
                  <td className="px-3 py-1.5 text-end tabular-nums">{m.headcount}</td>
                  <td className="px-3 py-1.5 text-end tabular-nums">{m.joiners || ""}</td>
                  <td className="px-3 py-1.5 text-end tabular-nums">{m.leavers || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-4">
          <Card className="space-y-1.5">
            <h3 className="text-sm font-semibold">Why people left</h3>
            {reasons.length === 0 ? <p className="text-sm text-fg-muted">Nobody left.</p> : (
              <ul className="text-sm" aria-label="Leaving reasons">
                {reasons.map(([k, n]) => <li key={k} className="flex justify-between"><span>{EXIT_REASONS[k] ?? k}</span><span className="tabular-nums">{n}</span></li>)}
              </ul>
            )}
          </Card>
          <Card className="space-y-1.5">
            <h3 className="text-sm font-semibold">By department</h3>
            <ul className="text-sm" aria-label="Staff by department">
              {(a.by_department ?? []).map((d) => (
                <li key={d.department} className="flex justify-between gap-2">
                  <span className="truncate">{d.department}</span>
                  <span className="tabular-nums text-fg-muted">{d.headcount}{d.leavers ? ` · ${d.leavers} left` : ""}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </section>
  );
}
