"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";

/** What an employee holds now (wave A, H22); offboarding lists it too (wave C). */
export function HeldAssetsCard({ employeeId }: { employeeId: string }) {
  const [rows, setRows] = useState<Schema<"AssetOut">[] | null>(null);
  useEffect(() => {
    api<Schema<"AssetOut">[]>(`/hrms/employees/${employeeId}/assets`, { notify: false }).then(setRows).catch(() => setRows([]));
  }, [employeeId]);
  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Assets</h2>
        <Link href="/hrms/assets" className="text-xs text-brand hover:underline">All assets →</Link>
      </div>
      {rows === null ? null : rows.length === 0 ? <p className="text-sm text-fg-muted">Holds nothing.</p> : (
        <ul className="text-sm" aria-label="Assets held">
          {rows.map((a) => <li key={a.id}>{a.name}{a.tag ? <span className="ms-1.5 font-mono text-xs text-fg-subtle">{a.tag}</span> : null}</li>)}
        </ul>
      )}
    </Card>
  );
}
