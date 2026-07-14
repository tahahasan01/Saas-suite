"use client";

import { useEffect, useState } from "react";
import type { Payslip } from "@business-os/types";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { Card, Input } from "@/components/ui";

export default function MyPayslips() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [slip, setSlip] = useState<Payslip | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    api<Payslip[]>(`/me/payslips?month=${month}`)
      .then((s) => setSlip(s[0] ?? null))
      .catch(() => setSlip(null))
      .finally(() => setLoaded(true));
  }, [month]);

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">My payslip</h1>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
      </div>

      {!loaded ? (
        <p className="text-sm text-fg-subtle">Loading…</p>
      ) : !slip ? (
        <Card><p className="py-6 text-center text-sm text-fg-subtle">No payslip for this month.</p></Card>
      ) : (
        <Card className="space-y-4">
          <div>
            <p className="text-sm font-semibold">{slip.name}</p>
            <p className="text-xs text-fg-subtle">
              {new Date(`${month}-01`).toLocaleDateString("en-PK", { month: "long", year: "numeric" })}
            </p>
          </div>

          <div className="space-y-1.5 border-t border-line pt-3 text-sm">
            <Line label="Gross salary" value={money(slip.gross_minor)} />
            <Line label="Present days" value={String(slip.present_days)} muted />
            {slip.wfh_days > 0 && <Line label="Work from home" value={`${slip.wfh_days} days`} muted />}
            {slip.paid_leave_days > 0 && <Line label="Paid leave" value={`${slip.paid_leave_days} days`} muted />}
            {slip.absence_deduction_minor > 0 && (
              <Line label={`Absence (${slip.absent_days + slip.unpaid_leave_days} days)`} value={`−${money(slip.absence_deduction_minor)}`} />
            )}
            <Line label="Income tax (FBR)" value={`−${money(slip.tax_minor)}`} />
          </div>

          <div className="flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-sm font-semibold">Net pay</span>
            <span className="text-xl font-semibold tabular-nums text-brand">{money(slip.net_minor)}</span>
          </div>
        </Card>
      )}
    </div>
  );
}

function Line({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={muted ? "text-fg-subtle" : "text-fg-muted"}>{label}</span>
      <span className={`tabular-nums ${muted ? "text-fg-muted" : ""}`}>{value}</span>
    </div>
  );
}
