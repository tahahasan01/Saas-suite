"use client";

import { useEffect, useState } from "react";
import type { Payroll } from "@business-os/types";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { Card, Input } from "@/components/ui";

export default function PayrollPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<Payroll | null>(null);

  useEffect(() => {
    api<Payroll>(`/hrms/payroll?month=${month}`).then(setData).catch(() => setData(null));
  }, [month]);

  const totalNet = data?.payslips.reduce((s, p) => s + p.net_minor, 0) ?? 0;

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
        <span className="text-sm text-fg-muted">Payroll · net total {money(totalNet)}</span>
      </div>
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-subtle">
              <th className="p-3">Employee</th>
              <th className="p-3 text-right">Gross</th>
              <th className="p-3 text-right">Present</th>
              <th className="p-3 text-right">Deduction</th>
              <th className="p-3 text-right">FBR tax</th>
              <th className="p-3 text-right">Net pay</th>
            </tr>
          </thead>
          <tbody>
            {(!data || data.payslips.length === 0) && (
              <tr><td colSpan={6} className="p-6 text-center text-fg-subtle">No employees to run payroll for.</td></tr>
            )}
            {data?.payslips.map((p) => (
              <tr key={p.employee_id} className="border-b border-line/60">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3 text-right text-fg-muted">{money(p.gross_minor)}</td>
                <td className="p-3 text-right text-fg-muted">{p.present_days}/{data.working_days}</td>
                <td className="p-3 text-right text-fg-muted">{p.absence_deduction_minor ? `−${money(p.absence_deduction_minor)}` : "—"}</td>
                <td className="p-3 text-right text-fg-muted">−{money(p.tax_minor)}</td>
                <td className="p-3 text-right font-semibold">{money(p.net_minor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
