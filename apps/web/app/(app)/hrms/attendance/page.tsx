"use client";

import { useCallback, useEffect, useState } from "react";
import type { Attendance, AttendanceWeek, Employee } from "@business-os/types";
import { api } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" }) : "—");

export default function AttendancePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [att, setAtt] = useState<Record<string, Attendance>>({});
  const [week, setWeek] = useState<AttendanceWeek | null>(null);

  const load = useCallback(async () => {
    const [emp, rows] = await Promise.all([
      api<Employee[]>("/hrms/employees"),
      api<Attendance[]>("/hrms/attendance"),
    ]);
    setEmployees(emp);
    setAtt(Object.fromEntries(rows.map((r) => [r.employee_id, r])));
    api<AttendanceWeek>("/hrms/attendance/week").then(setWeek).catch(() => setWeek(null));
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
    <div className="space-y-5">
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

    {week && week.employees.length > 0 && <WeekMatrix week={week} />}
    </div>
  );
}

/* Rows are people, columns are the last 7 days, and one glance answers "who has
   been in this week?". The statuses come from the same derivation payroll uses,
   so this grid and the payslip can never disagree about a day. */
const CELL: Record<string, { cls: string; label: string }> = {
  present: { cls: "bg-success", label: "Present" },
  late:    { cls: "bg-warning", label: "Late" },
  leave:   { cls: "bg-[var(--color-chart-2)]", label: "Leave" },
  wfh:     { cls: "bg-brand", label: "WFH" },
  holiday: { cls: "bg-line-strong", label: "Holiday" },
  off:     { cls: "bg-elevated", label: "Weekly off" },
  pending: { cls: "bg-elevated border border-dashed border-line-strong", label: "Not in yet" },
  absent:  { cls: "bg-danger", label: "Absent" },
  none:    { cls: "bg-transparent", label: "Before joining" },
};

function WeekMatrix({ week }: { week: AttendanceWeek }) {
  const dayName = (iso: string) =>
    new Date(iso).toLocaleDateString("en-PK", { weekday: "short" });
  // Only explain the statuses actually on screen — a nine-entry legend for a
  // three-state week is noise.
  const used = [...new Set(week.employees.flatMap((e) => e.cells))].filter((s) => s !== "none");

  return (
    <Card className="p-0">
      <p className="border-b border-line px-4 py-2.5 text-sm font-semibold">This week</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-fg-subtle">
              <th className="px-4 py-2">Employee</th>
              {week.days.map((d) => (
                <th key={d} className="px-2 py-2 text-center font-normal">
                  {dayName(d)}
                  <span className="block text-[10px]">{new Date(d).getDate()}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {week.employees.map((e) => (
              <tr key={e.id} className="border-t border-line/60">
                <td className="px-4 py-2 font-medium">{e.name}</td>
                {e.cells.map((c, i) => {
                  const s = CELL[c] ?? CELL.none;
                  return (
                    <td key={i} className="px-2 py-2 text-center">
                      <span
                        className={`inline-block h-4 w-4 rounded ${s.cls}`}
                        title={`${dayName(week.days[i])}: ${s.label}`}
                        aria-label={s.label}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-line px-4 py-2.5 text-[11px] text-fg-muted">
        {used.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded ${CELL[s]?.cls}`} />
            {CELL[s]?.label}
          </span>
        ))}
      </div>
    </Card>
  );
}
