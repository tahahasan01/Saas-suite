"use client";

import { useCallback, useEffect, useState } from "react";
import type { FunnelRow, LostReasonRow, Pipeline, SourceRow } from "@business-os/types";
import { api, apiUrl } from "@/lib/api";
import { money } from "@/lib/format";
import { errorText } from "@/lib/useAction";
import { Card, EmptyState, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";
import { TargetsAndForecast } from "@/components/crm/TargetsForecast";

type Filters = { pipeline_id: string; date_from: string; date_to: string };

function qs(f: Filters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  Object.entries({ ...f, ...extra }).forEach(([k, v]) => v && p.set(k, v));
  return p.toString();
}

/** Funnel, lost reasons and sources (08), each with its CSV. */
export default function CrmReportsPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [f, setF] = useState<Filters>({ pipeline_id: "", date_from: "", date_to: "" });
  const [funnel, setFunnel] = useState<FunnelRow[] | null>(null);
  const [reasons, setReasons] = useState<LostReasonRow[] | null>(null);
  const [sources, setSources] = useState<SourceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Pipeline[]>("/crm/pipelines").then((ps) => {
      setPipelines(ps);
      setF((cur) => ({ ...cur, pipeline_id: cur.pipeline_id || (ps.find((p) => p.is_default) ?? ps[0])?.id || "" }));
    }).catch((e) => setError(errorText(e, "Couldn't load your pipelines.")));
  }, []);

  const load = useCallback(() => {
    if (!f.pipeline_id) return;
    setError(null);
    const q = qs(f);
    Promise.all([
      api<{ rows: FunnelRow[] }>(`/crm/reports/funnel?${q}`),
      api<{ rows: LostReasonRow[] }>(`/crm/reports/lost-reasons?${q}`),
      api<{ rows: SourceRow[] }>(`/crm/reports/sources?${q}`),
    ]).then(([a, b, c]) => { setFunnel(a.rows); setReasons(b.rows); setSources(c.rows); })
      .catch((e) => setError(errorText(e, "Couldn't load the reports.")));
  }, [f]);
  useEffect(load, [load]);

  const csv = (name: string) => apiUrl(`/crm/reports/${name}?${qs(f, { format: "csv" })}`);
  const top = Math.max(1, ...(funnel ?? []).map((r) => r.reached));

  return (
    <div className="space-y-6">
      <TargetsAndForecast />
      <div className="flex flex-wrap items-end gap-3">
        {pipelines.length > 1 && (
          <div className="w-48">
            <Field label="Pipeline">
              <Select value={f.pipeline_id} onChange={(e) => setF({ ...f, pipeline_id: e.target.value })}>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          </div>
        )}
        <div className="w-40">
          <Field label="Created from">
            <Input type="date" value={f.date_from} onChange={(e) => setF({ ...f, date_from: e.target.value })} />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Created to">
            <Input type="date" value={f.date_to} onChange={(e) => setF({ ...f, date_to: e.target.value })} />
          </Field>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : funnel === null ? <LoadingRows label="Loading reports" /> : (
        <>
          <Report title="Funnel" hint="How many leads reached each stage. A lost lead counts up to the stage it was lost in." href={csv("funnel")} name="funnel">
            {funnel.every((r) => r.reached === 0) ? <EmptyState title="No leads in this range" /> : (
              <table className="w-full text-sm">
                <caption className="sr-only">Funnel</caption>
                <thead><tr className="text-start text-xs text-fg-subtle">
                  <th className="py-1 font-medium">Stage</th><th className="py-1 text-end font-medium">Reached</th>
                  <th className="py-1 text-end font-medium">Value</th><th className="py-1 text-end font-medium">Step</th>
                </tr></thead>
                <tbody>
                  {funnel.map((r) => (
                    <tr key={r.stage_id} className="border-t border-line">
                      <td className="py-2">
                        <span className="block">{r.stage}</span>
                        <span className="mt-1 block h-1.5 rounded bg-brand/70" style={{ width: `${(100 * r.reached) / top}%` }} aria-hidden />
                      </td>
                      <td className="py-2 text-end tabular-nums">{r.reached}</td>
                      <td className="py-2 text-end tabular-nums">{money(r.value_minor)}</td>
                      <td className="py-2 text-end tabular-nums text-fg-muted">{r.conversion_pct == null ? "—" : `${r.conversion_pct}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Report>

          <Report title="Lost reasons" hint="Why deals were lost." href={csv("lost-reasons")} name="lost-reasons">
            {reasons && reasons.length === 0 ? <EmptyState title="No lost leads in this range" /> : (
              <table className="w-full text-sm">
                <caption className="sr-only">Lost reasons</caption>
                <thead><tr className="text-start text-xs text-fg-subtle">
                  <th className="py-1 font-medium">Reason</th><th className="py-1 text-end font-medium">Leads</th>
                  <th className="py-1 text-end font-medium">Value</th>
                </tr></thead>
                <tbody>
                  {reasons?.map((r) => (
                    <tr key={r.reason} className="border-t border-line">
                      <td className="py-2">{r.reason}</td>
                      <td className="py-2 text-end tabular-nums">{r.count}</td>
                      <td className="py-2 text-end tabular-nums">{money(r.value_minor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Report>

          <Report title="Sources" hint="Where leads come from, and how often they turn into sales." href={csv("sources")} name="sources">
            {sources && sources.length === 0 ? <EmptyState title="No leads in this range" /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-sm">
                  <caption className="sr-only">Sources</caption>
                  <thead><tr className="text-start text-xs text-fg-subtle">
                    <th className="py-1 font-medium">Source</th><th className="py-1 text-end font-medium">Leads</th>
                    <th className="py-1 text-end font-medium">Open</th><th className="py-1 text-end font-medium">Won</th>
                    <th className="py-1 text-end font-medium">Lost</th><th className="py-1 text-end font-medium">Won value</th>
                    <th className="py-1 text-end font-medium">Win rate</th>
                  </tr></thead>
                  <tbody>
                    {sources?.map((r) => (
                      <tr key={r.source} className="border-t border-line">
                        <td className="py-2">{r.source}</td>
                        <td className="py-2 text-end tabular-nums">{r.leads}</td>
                        <td className="py-2 text-end tabular-nums">{r.open}</td>
                        <td className="py-2 text-end tabular-nums">{r.won}</td>
                        <td className="py-2 text-end tabular-nums">{r.lost}</td>
                        <td className="py-2 text-end tabular-nums">{money(r.won_value_minor)}</td>
                        <td className="py-2 text-end tabular-nums text-fg-muted">{r.win_rate_pct == null ? "—" : `${r.win_rate_pct}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Report>
        </>
      )}
    </div>
  );
}

function Report({ title, hint, href, name, children }: {
  title: string; hint: string; href: string; name: string; children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold">{title}</h2>
          <p className="text-xs text-fg-muted">{hint}</p>
        </div>
        <a href={href} download={`crm-${name}.csv`} className="text-sm font-medium text-brand hover:underline">
          Download CSV<span className="sr-only"> ({title})</span>
        </a>
      </div>
      {children}
    </Card>
  );
}
