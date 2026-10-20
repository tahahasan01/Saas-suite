"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Payroll, Payslip } from "@business-os/types";
import { api } from "@/lib/api";
import { monthPKT } from "@/lib/dates";
import { money } from "@/lib/format";
import { errorText } from "@/lib/useAction";
import { DataTable, type Column } from "@/components/DataTable";
import { Button, Card, EmptyState, ErrorState, Field, Input } from "@/components/ui";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2026-01" stepped by ±n months. */
function shift(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString("en-PK", { month: "long", year: "numeric" });

const dash = (n: number) => (n ? String(n) : "—");

export default function PayrollPage() {
  // The business month is Pakistan's: in UTC the 1st opened on last month.
  const [month, setMonth] = useState(monthPKT);
  // What's in the field. Firefox and Safari show type=month as plain text, so
  // a half-typed "2026-1" must not be sent; only a whole YYYY-MM is.
  const [draft, setDraft] = useState(month);
  const [data, setData] = useState<Payroll | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((m: string) => {
    setData(null);
    setError(null);
    api<Payroll>(`/hrms/payroll?month=${m}`).then(setData).catch((e) => setError(errorText(e, "Couldn't run payroll for this month.")));
  }, []);
  useEffect(() => load(month), [load, month]);

  function pick(m: string) {
    setDraft(m);
    setMonth(m);
  }

  const slips = data?.payslips ?? [];
  const sum = (f: (p: Payslip) => number) => slips.reduce((s, p) => s + f(p), 0);
  const totals = {
    gross: sum((p) => p.gross_minor),
    deductions: sum((p) => p.absence_deduction_minor + p.tax_minor),
    net: sum((p) => p.net_minor),
  };

  const columns: Column<Payslip>[] = [
    {
      key: "name", header: "Employee", primary: true,
      // On a phone card the net pay sits beside the name — it's the number
      // people open payroll for. The table has its own Net pay column.
      cell: (p) => (
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0 break-words font-medium">{p.name}</span>
          <span className="shrink-0 text-right tabular-nums sm:hidden">
            <span className="block text-[10px] font-normal text-fg-subtle">Net pay</span>
            <span className="font-semibold">{money(p.net_minor)}</span>
          </span>
        </span>
      ),
    },
    // Second, not last: with six-digit amounts at 1366 the last column sat
    // past the table's scroll edge, and net pay is what people open this for.
    // (The Employee column stays pinned while the rest scroll.)
    {
      key: "net", header: "Net pay", align: "right", hideOnCard: true,
      cell: (p) => <span className="font-semibold">{money(p.net_minor)}</span>,
    },
    { key: "gross", header: "Gross", align: "right", cell: (p) => money(p.gross_minor) },
    { key: "present", header: "Present", align: "right", cell: (p) => `${p.present_days}/${data?.working_days ?? 0}` },
    {
      key: "leave", header: "Leave", align: "right",
      cell: (p) => {
        const days = p.paid_leave_days + p.unpaid_leave_days;
        return days === 0 ? "—" : `${days}${p.unpaid_leave_days ? ` (${p.unpaid_leave_days} unpaid)` : ""}`;
      },
    },
    { key: "wfh", header: "WFH", align: "right", cell: (p) => dash(p.wfh_days) },
    {
      key: "absent", header: "Absent", align: "right",
      cell: (p) => <span className={p.absent_days ? "text-warning" : ""}>{dash(p.absent_days)}</span>,
    },
    {
      key: "deduction", header: "Deduction", align: "right",
      cell: (p) => (p.absence_deduction_minor ? `−${money(p.absence_deduction_minor)}` : "—"),
    },
    // No tax is "—" like every other empty cell, not "−Rs 0".
    { key: "tax", header: "FBR tax", align: "right", cell: (p) => (p.tax_minor ? `−${money(p.tax_minor)}` : "—") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex items-end gap-1.5">
          <Button variant="subtle" aria-label="Previous month" onClick={() => pick(shift(month, -1))} className="px-2.5">
            <ChevronLeft size={16} aria-hidden />
          </Button>
          <Field label="Month">
            <Input
              type="month"
              value={draft}
              placeholder="YYYY-MM"
              pattern="\d{4}-\d{2}"
              className="block w-44"
              onChange={(e) => {
                setDraft(e.target.value);
                if (MONTH_RE.test(e.target.value)) setMonth(e.target.value);
              }}
              onBlur={() => setDraft(month)}
            />
          </Field>
          <Button variant="subtle" aria-label="Next month" onClick={() => pick(shift(month, 1))} className="px-2.5">
            <ChevronRight size={16} aria-hidden />
          </Button>
        </div>
        {data && (
          <p className="pb-2 text-xs text-fg-subtle">
            {data.working_days} working days ·{" "}
            <Link href="/hrms/holidays" className="text-brand hover:underline">manage holidays</Link>
          </p>
        )}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => load(month)} />
      ) : (
        <>
          {data && slips.length > 0 && (
            // One tile a row on the smallest phones, two from 400px, four only
            // once the content area is wide enough for an 8-digit total.
            <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:grid-cols-4">
              <Total label="Employees" value={String(slips.length)} />
              <Total label="Gross" value={money(totals.gross)} />
              <Total label="Deductions & tax" value={totals.deductions ? `−${money(totals.deductions)}` : "—"} />
              <Total label="Net to pay" value={money(totals.net)} accent />
            </div>
          )}
          <DataTable
            columns={columns}
            rows={slips}
            rowKey={(p) => p.employee_id}
            loading={!data}
            caption={`Payroll for ${monthName(month)}`}
            empty={<EmptyState title="No employees to run payroll for" hint="Add staff on the Team tab and their payslips appear here." />}
          />
        </>
      )}
    </div>
  );
}

function Total({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-fg-subtle">{label}</p>
      {/* Never broken mid-number ("Rs 1,234,5 / 67"): the grid gives each
          tile enough width instead. */}
      <p className={`mt-1 whitespace-nowrap text-base font-semibold tabular-nums sm:text-lg ${accent ? "text-brand" : ""}`}>{value}</p>
    </Card>
  );
}
