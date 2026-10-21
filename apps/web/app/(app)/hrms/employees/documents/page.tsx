"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { EmployeeDocument } from "@business-os/types";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { errorText } from "@/lib/useAction";
import { DataTable, type Column } from "@/components/DataTable";
import { ExpiryBadge } from "@/components/hrms/ExpiryBadge";
import { EmptyState, ErrorState, Field, Select } from "@/components/ui";

/* What HR works through before an inspection: expired documents and those
   running out soon, soonest first. */
export default function ExpiringDocuments() {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<EmployeeDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setRows(null);
    api<EmployeeDocument[]>(`/hrms/documents/expiring?days=${days}`)
      .then(setRows).catch((e) => setError(errorText(e, "Couldn't load documents.")));
  }, [days]);
  useEffect(load, [load]);

  const columns: Column<EmployeeDocument>[] = [
    {
      key: "who", header: "Employee", primary: true,
      cell: (d) => <Link href={`/hrms/employees/${d.employee_id}`} className="font-medium hover:underline">{d.employee_name}</Link>,
    },
    { key: "doc", header: "Document", cell: (d) => <span>{d.title}{d.number && <span className="text-fg-subtle"> · {d.number}</span>}</span> },
    { key: "expires", header: "Expires", cell: (d) => <span className="tabular-nums text-fg-muted">{d.expires_on ? formatDay(d.expires_on) : "—"}</span> },
    { key: "left", header: "", cell: (d) => <ExpiryBadge days={d.days_left} /> },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Show documents expiring within">
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="block w-40">
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </Select>
        </Field>
      </div>
      {error ? <ErrorState message={error} onRetry={load} /> : (
        <DataTable
          columns={columns}
          rows={rows ?? []}
          rowKey={(d) => d.id}
          loading={!rows}
          caption="Documents expired or expiring soon"
          empty={<EmptyState title="Nothing expiring" hint="Add documents with an expiry date on each employee's page." />}
        />
      )}
    </div>
  );
}
