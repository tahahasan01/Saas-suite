"use client";

import { useCallback, useEffect, useState } from "react";
import type { Attendance, Employee } from "@business-os/types";
import { api } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" }) : "—");

export default function AttendancePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [att, setAtt] = useState<Record<string, Attendance>>({});

  const load = useCallback(async () => {
    const [emp, rows] = await Promise.all([
      api<Employee[]>("/hrms/employees"),
      api<Attendance[]>("/hrms/attendance"),
    ]);
    setEmployees(emp);
    setAtt(Object.fromEntries(rows.map((r) => [r.employee_id, r])));
  }, []);
  useEffect(() => { load().catch(() => {}); }, [load]);

  async function checkin(id: string) {
    await api("/hrms/attendance/checkin", { method: "POST", body: JSON.stringify({ employee_id: id, method: "web" }) }).catch(() => {});
    load();
  }
  async function checkout(id: string) {
    await api("/hrms/attendance/checkout", { method: "POST", body: JSON.stringify({ employee_id: id }) }).catch(() => {});
    load();
  }

  return (
    <Card className="p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-fg-subtle">
            <th className="p-3">Employee</th>
            <th className="p-3">Status</th>
            <th className="p-3">In</th>
            <th className="p-3">Out</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {employees.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-fg-subtle">No employees yet.</td></tr>}
          {employees.map((e) => {
            const a = att[e.id];
            return (
              <tr key={e.id} className="border-b border-line/60">
                <td className="p-3 font-medium">{e.name}</td>
                <td className="p-3">
                  {!a ? <span className="text-fg-subtle">Not in</span> : (
                    <span className="flex items-center gap-2">
                      <Badge tone={a.status === "late" ? "warning" : "success"}>{a.status}</Badge>
                      {a.fraud_flag && <Badge tone="danger">⚠ {a.fraud_flag}</Badge>}
                    </span>
                  )}
                </td>
                <td className="p-3 text-fg-muted">{time(a?.check_in ?? null)}</td>
                <td className="p-3 text-fg-muted">{time(a?.check_out ?? null)}</td>
                <td className="p-3 text-right">
                  {!a?.check_in ? (
                    <Button size="sm" onClick={() => checkin(e.id)}>Check in</Button>
                  ) : !a?.check_out ? (
                    <Button size="sm" variant="subtle" onClick={() => checkout(e.id)}>Check out</Button>
                  ) : (
                    <span className="text-xs text-fg-subtle">Done</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
