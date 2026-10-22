"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { errorText } from "@/lib/useAction";
import { Badge, EmptyState, ErrorState, LoadingRows } from "@/components/ui";

type Row = Schema<"RequestRow">;
const TONE = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" } as const;
const KIND: Record<string, string> = { leave: "Leave", wfh: "WFH", correction: "Correction", overtime: "Overtime" };

/** One list of requests (wave A, H16): an employee's own, or what waits for a
 *  manager. Each row links to where it's decided or followed up. */
export function RequestList({ path, showWho, empty, label }: { path: string; showWho: boolean; empty: string; label: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Row[]>(path).then(setRows).catch((e) => setError(errorText(e)));
  }, [path]);
  useEffect(load, [load]);
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (rows === null) return <LoadingRows rows={3} />;
  if (rows.length === 0) return <EmptyState title={empty} />;
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label={label}>
      {rows.map((r) => (
        <li key={`${r.kind}-${r.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <span className="min-w-0">
            <span className="me-1.5 text-xs font-medium text-fg-muted">{KIND[r.kind]}</span>
            {showWho && <span className="font-medium">{r.employee_name} · </span>}
            <span>{r.title}</span>
            <span className="block text-xs text-fg-subtle">Asked {formatDateTime(r.created_at)}{r.reason ? ` · ${r.reason}` : ""}</span>
          </span>
          <span className="flex items-center gap-2">
            <Badge tone={TONE[r.status as keyof typeof TONE] ?? "neutral"}>{r.status}</Badge>
            <Link href={r.link} className="text-xs text-brand hover:underline">{showWho ? "Decide →" : "Open →"}</Link>
          </span>
        </li>
      ))}
    </ul>
  );
}
