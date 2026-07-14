"use client";

import { useEffect, useState } from "react";
import type { Attendance } from "@business-os/types";
import { api } from "@/lib/api";
import { Badge, Card } from "@/components/ui";

const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" }) : "—";
const dateOf = (d: string) =>
  new Date(d).toLocaleDateString("en-PK", { weekday: "short", day: "numeric", month: "short" });

export default function MyAttendance() {
  const [rows, setRows] = useState<Attendance[]>([]);

  useEffect(() => {
    api<Attendance[]>("/me/attendance").then(setRows).catch(() => setRows([]));
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">My attendance</h1>
      <p className="mb-4 text-sm text-fg-muted">This month, newest first.</p>
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-subtle">
              <th className="p-3">Date</th>
              <th className="p-3">Status</th>
              <th className="p-3">In</th>
              <th className="p-3">Out</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="p-6 text-center text-fg-subtle">No attendance recorded yet this month.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line/60">
                <td className="p-3 font-medium">{dateOf(r.work_date)}</td>
                <td className="p-3"><Badge tone={r.status === "late" ? "warning" : "success"}>{r.status}</Badge></td>
                <td className="p-3 tabular-nums text-fg-muted">{timeOf(r.check_in)}</td>
                <td className="p-3 tabular-nums text-fg-muted">{timeOf(r.check_out)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
