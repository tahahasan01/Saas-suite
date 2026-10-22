"use client";

import { useCallback, useEffect, useState } from "react";
import { api, apiUrl } from "@/lib/api";
import { money } from "@/lib/format";
import { dayPKT } from "@/lib/dates";
import { Button, cx, EmptyState, ErrorState, Field, Input, Select } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";

/* One report screen (3G): pick a report and a range, read it, download it
 * as CSV. The server does the sums; this only shows them. */

export interface ReportCol { key: string; header: string; money?: boolean; primary?: boolean }
export interface ReportDef {
  id: string;
  label: string;
  /** The API path with its own query (no range, no format). */
  path: string;
  cols: ReportCol[];
  /** Reports without a date range (stock on hand, a payroll run). */
  noRange?: boolean;
  /** Extra inputs (a payroll run) render here and feed the path. */
  needs?: { param: string; label: string; options: () => Promise<{ value: string; label: string }[]> };
}
type Row = Record<string, string | number | null>;

const monthAgo = () => dayPKT(new Date(Date.now() - 29 * 864e5));

export function ReportView({ reports }: { reports: ReportDef[] }) {
  const [id, setId] = useState(reports[0].id);
  const report = reports.find((r) => r.id === id)!;
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(() => dayPKT());
  const [extra, setExtra] = useState("");
  const [options, setOptions] = useState<{ value: string; label: string }[] | null>(null);
  const [data, setData] = useState<{ rows: Row[]; total_minor?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOptions(null);
    setExtra("");
    report.needs?.options().then((o) => { setOptions(o); setExtra(o[0]?.value ?? ""); }).catch(() => setOptions([]));
  }, [report]);

  const query = useCallback((format?: "csv") => {
    const q = new URLSearchParams();
    if (!report.noRange) { q.set("from", from); q.set("to", to); }
    if (report.needs) q.set(report.needs.param, extra);
    if (format) q.set("format", format);
    return `${report.path}${report.path.includes("?") ? "&" : "?"}${q}`;
  }, [report, from, to, extra]);

  const ready = !report.needs || extra !== "";
  const load = useCallback(() => {
    if (!ready) { setData({ rows: [] }); return; }
    setData(null);
    setError(null);
    api<{ rows: Row[]; total_minor?: number }>(query(), { notify: false })
      .then(setData)
      .catch((e: Error) => setError(e.message || "Couldn't load the report."));
  }, [query, ready]);
  useEffect(load, [load]);

  const columns: Column<Row>[] = report.cols.map((c, i) => ({
    key: c.key,
    header: c.header,
    primary: c.primary ?? i === 0,
    align: c.money || typeof data?.rows[0]?.[c.key] === "number" ? "right" : undefined,
    cell: (r) => {
      const v = r[c.key];
      if (v === null || v === undefined || v === "") return <span className="text-fg-subtle">—</span>;
      return c.money ? money(Number(v)) : String(v);
    },
  }));

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Reports" className="flex flex-wrap gap-1.5">
        {reports.map((r) => (
          <button key={r.id} type="button" role="tab" aria-selected={r.id === id} onClick={() => setId(r.id)}
                  className={cx("min-h-9 rounded-full border px-3 text-sm font-medium",
                                r.id === id ? "border-brand bg-brand-subtle text-brand" : "border-line text-fg-muted hover:text-fg")}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {!report.noRange && (
          <>
            <Field label="From"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
          </>
        )}
        {report.needs && (
          <Field label={report.needs.label}>
            <Select value={extra} onChange={(e) => setExtra(e.target.value)} disabled={!options?.length}>
              {(options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
        )}
        <a href={ready ? apiUrl(query("csv")) : undefined} download aria-disabled={!ready}
           className={cx("inline-flex min-h-10 items-center rounded-lg border border-line px-3 text-sm font-medium hover:bg-surface-2",
                         !ready && "pointer-events-none opacity-50")}>
          Download CSV
        </a>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <DataTable columns={columns} rows={data?.rows ?? []} rowKey={(r) => report.cols.map((c) => r[c.key]).join("|")}
                     loading={data === null} caption={report.label}
                     empty={<EmptyState title={report.needs && options?.length === 0 ? "Nothing to report on yet." : "Nothing in this range."} />} />
          {data?.total_minor !== undefined && (
            <p className="text-end text-sm font-semibold">Total {money(data.total_minor)}</p>
          )}
        </>
      )}
      {report.needs && options === null && <Button variant="subtle" disabled>Loading…</Button>}
    </div>
  );
}
