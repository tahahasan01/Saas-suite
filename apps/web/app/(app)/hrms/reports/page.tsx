"use client";

import { api } from "@/lib/api";
import { useCan } from "@/lib/can";
import { ReportView, type ReportDef } from "@/components/reports/ReportView";

const ATTENDANCE: ReportDef = {
  id: "attendance", label: "Attendance", path: "/reports/attendance", cols: [
    { key: "name", header: "Employee" }, { key: "present", header: "Present" }, { key: "late", header: "Late" },
    { key: "half_day", header: "Half days" }, { key: "absent", header: "Absent" }, { key: "leave", header: "Leave" },
    { key: "worked_min", header: "Minutes worked" }, { key: "late_min", header: "Minutes late" },
    { key: "overtime_min", header: "Overtime minutes" }],
};

interface Run { id: string; number: string; period_start: string; status: string }
const FINAL = new Set(["approved", "paid", "locked"]);

const PAYROLL: ReportDef = {
  id: "payroll", label: "Payroll", path: "/reports/payroll", noRange: true,
  needs: {
    param: "run_id", label: "Payroll run",
    // Only approved runs report (the server says so too).
    options: async () => (await api<Run[]>("/payroll/runs", { notify: false }))
      .filter((r) => FINAL.has(r.status))
      .map((r) => ({ value: r.id, label: `${r.number} · ${r.period_start.slice(0, 7)}` })),
  },
  cols: [
    { key: "name", header: "Employee" }, { key: "present_days", header: "Days present" },
    { key: "gross_minor", header: "Gross", money: true }, { key: "deductions_minor", header: "Deductions", money: true },
    { key: "tax_minor", header: "Income tax", money: true }, { key: "net_minor", header: "Net pay", money: true },
    { key: "employer_cost_minor", header: "Employer cost", money: true }],
};

export default function HrmsReportsPage() {
  const can = useCan();
  const reports = can("payroll.report.export") ? [ATTENDANCE, PAYROLL] : [ATTENDANCE];
  return (
    <>
      <p className="mb-6 text-sm text-fg-muted">Attendance and payroll for your team, ready to download as CSV.</p>
      <ReportView reports={reports} />
    </>
  );
}
