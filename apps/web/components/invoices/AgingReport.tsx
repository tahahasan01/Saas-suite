"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api, apiUrl } from "@/lib/api";
import { formatDay, money } from "@/lib/format";
import { errorText } from "@/lib/useAction";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui";

type Report = Schema<"AgingReport">;
type Buckets = Schema<"AgingBuckets">;

const COLS: { key: keyof Buckets; label: string }[] = [
  { key: "current_minor", label: "Not yet due" }, { key: "d1_30_minor", label: "1–30 days" },
  { key: "d31_60_minor", label: "31–60" }, { key: "d61_90_minor", label: "61–90" },
  { key: "d90_plus_minor", label: "Over 90" }, { key: "total_minor", label: "Total" },
];

/** Receivables aging (PRD INV-10): what each customer owes, by how late. */
export function AgingReport() {
  const [rep, setRep] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Report>("/invoices/aging").then(setRep).catch((e) => setError(errorText(e, "Couldn't load the report.")));
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!rep) return <LoadingRows rows={4} label="Loading who owes what" />;
  if (rep.rows.length === 0) return <EmptyState title="Nobody owes you anything" hint="Issued invoices with a balance show here." />;
  return (
    <section aria-labelledby="aging-title" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="aging-title" className="text-sm font-semibold">Who owes what, as of {formatDay(rep.as_of)}</h2>
        <a href={apiUrl("/invoices/aging?format=csv")} className="text-sm text-brand hover:underline">Download CSV</a>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">Balances by customer and days late</caption>
          <thead>
            <tr className="text-xs text-fg-subtle">
              <th scope="col" className="py-1.5 text-start font-medium">Customer</th>
              {COLS.map((c) => <th key={c.key} scope="col" className="py-1.5 text-end font-medium">{c.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rep.rows.map((r) => (
              <tr key={r.contact_id ?? r.contact_name} className="tabular-nums">
                <th scope="row" className="py-1.5 text-start font-normal">
                  {r.contact_name || "—"} <span className="text-xs text-fg-subtle">({r.invoices})</span>
                </th>
                {COLS.map((c) => (
                  <td key={c.key} className={`py-1.5 text-end ${c.key === "d90_plus_minor" && r[c.key] ? "text-danger" : ""} ${c.key === "total_minor" ? "font-medium" : ""}`}>
                    {r[c.key] ? money(r[c.key] ?? 0) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong font-semibold tabular-nums">
              <th scope="row" className="py-1.5 text-start">Total</th>
              {COLS.map((c) => <td key={c.key} className="py-1.5 text-end">{money(rep.totals[c.key] ?? 0)}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
