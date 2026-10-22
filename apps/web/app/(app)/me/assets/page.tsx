"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { errorText } from "@/lib/useAction";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui";

type Asset = Schema<"AssetOut">;

/** What the company has issued to me (wave A, H22). */
export default function MyAssets() {
  const [rows, setRows] = useState<Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Asset[]>("/me/assets").then(setRows).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (rows === null) return <LoadingRows rows={2} label="Loading your assets" />;
  if (rows.length === 0) return <EmptyState title="Nothing issued to you" hint="Laptops, phones and other things the company gives you show here." />;
  return (
    <ul className="mx-auto max-w-2xl divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label="My assets">
      {rows.map((a) => (
        <li key={a.id} className="px-4 py-2.5">
          <span className="font-medium">{a.name}</span>{a.tag && <span className="ms-1.5 font-mono text-xs text-fg-subtle">{a.tag}</span>}
          <span className="block text-xs text-fg-muted">
            {a.serial_no ? `S/N ${a.serial_no} · ` : ""}with you since {a.issued_at ? formatDay(a.issued_at.slice(0, 10)) : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}
