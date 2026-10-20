"use client";

import { useCallback, useEffect, useState } from "react";
import type { Payslip } from "@business-os/types";
import { api } from "@/lib/api";
import { monthPKT } from "@/lib/dates";
import { formatMonth, money } from "@/lib/format";
import { errorText } from "@/lib/useAction";
import { RatesPendingBanner } from "@/components/RatesPending";
import { Card, EmptyState, ErrorState, Field, Input, LoadingRows } from "@/components/ui";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default function MyPayslips() {
  // Pakistan's month: in UTC the 1st still showed last month until 5am.
  const [month, setMonth] = useState(monthPKT);
  // Firefox and Safari show type=month as plain text; only fetch a whole YYYY-MM.
  const [draft, setDraft] = useState(month);
  const [slip, setSlip] = useState<Payslip | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((m: string) => {
    setLoaded(false);
    setError(null);
    api<Payslip[]>(`/me/payslips?month=${m}`)
      .then((s) => setSlip(s[0] ?? null))
      .catch((e) => { setSlip(null); setError(errorText(e, "Couldn't load that payslip.")); })
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => load(month), [load, month]);

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-fg-muted">Choose a month to see that payslip.</p>
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
      </div>

      {!loaded ? (
        <LoadingRows rows={4} label="Loading payslip" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(month)} />
      ) : !slip ? (
        <EmptyState title="No payslip for this month." />
      ) : (
        <div className="space-y-3">
        {!slip.tax_rates_verified && <RatesPendingBanner taxYear={slip.tax_year} />}
        <Card className="space-y-4">
          <div>
            <p className="text-sm font-semibold">{slip.name}</p>
            <p className="text-xs text-fg-subtle">
              {formatMonth(month)}
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
        </div>
      )}
    </div>
  );
}

function Line({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={muted ? "text-fg-subtle" : "text-fg-muted"}>{label}</span>
      <span className={`tabular-nums ${muted ? "text-fg-muted" : ""}`}>{value}</span>
    </div>
  );
}
