"use client";

import { useCallback, useEffect, useState } from "react";
import type { Attendance } from "@business-os/types";
import { api } from "@/lib/api";
import { errorText } from "@/lib/useAction";
import { DataTable, type Column } from "@/components/DataTable";
import { Badge, EmptyState, ErrorState } from "@/components/ui";

const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" }) : "—";
// work_date is a plain date; format it in UTC so it can't slip to the day before.
const dateOf = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-PK", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const columns: Column<Attendance>[] = [
  { key: "date", header: "Date", primary: true, cell: (r) => <span className="font-medium">{dateOf(r.work_date)}</span> },
  { key: "status", header: "Status", cell: (r) => <Badge tone={r.status === "late" ? "warning" : "success"}>{r.status}</Badge> },
  { key: "in", header: "In", cell: (r) => <span className="tabular-nums text-fg-muted">{timeOf(r.check_in)}</span> },
  { key: "out", header: "Out", cell: (r) => <span className="tabular-nums text-fg-muted">{timeOf(r.check_out)}</span> },
];

export default function MyAttendance() {
  const [rows, setRows] = useState<Attendance[] | null>(null); // null = loading
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<Attendance[]>("/me/attendance").then(setRows).catch((e) => setError(errorText(e, "Couldn't load your attendance.")));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-4 text-sm text-fg-muted">This month, newest first.</p>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows ?? []}
          rowKey={(r) => r.id}
          loading={!rows}
          caption="My attendance this month"
          empty={<EmptyState title="No attendance recorded yet this month." />}
        />
      )}
    </div>
  );
}
