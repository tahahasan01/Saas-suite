"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import type { StoredPayslip } from "@business-os/types";
import { api, apiUrl } from "@/lib/api";
import { monthPKT } from "@/lib/dates";
import { formatMonth, money } from "@/lib/format";
import { errorText } from "@/lib/useAction";
import { RatesPendingBanner } from "@/components/RatesPending";
import { Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows } from "@/components/ui";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * The employee's own payslips, as stored by approved payroll runs (D-40):
 * nothing is calculated here, so a payslip never changes after it is paid.
 */
export default function MyPayslips() {
  // Pakistan's month: in UTC the 1st still showed last month until 5am.
  const [month, setMonth] = useState(monthPKT);
  // Firefox and Safari show type=month as plain text; only fetch a whole YYYY-MM.
  const [draft, setDraft] = useState(month);
  const [slips, setSlips] = useState<StoredPayslip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback((m: string) => {
    setSlips(null);
    setError(null);
    api<StoredPayslip[]>(`/me/payslips?month=${m}`)
      .then(setSlips)
      .catch((e) => { setSlips([]); setError(errorText(e, "Couldn't load that payslip.")); });
  }, []);
  useEffect(() => load(month), [load, month]);

  // A 5-minute signed link (St03 risk 14), opened straight away.
  async function download(id: string) {
    setBusy(id);
    try {
      const link = await api<{ url: string }>(`/me/payslips/${id}/link`, { method: "POST" });
      window.open(apiUrl(link.url), "_blank", "noopener");
    } catch (e) {
      setError(errorText(e, "Couldn't prepare the PDF."));
    } finally {
      setBusy(null);
    }
  }

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

      {slips === null ? (
        <LoadingRows rows={4} label="Loading payslip" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(month)} />
      ) : slips.length === 0 ? (
        <EmptyState title="No payslip for this month yet." hint="It appears here once payroll for the month is approved." />
      ) : (
        <div className="space-y-3">
          {slips.some((s) => !s.tax_verified || !s.statutory_verified) && <RatesPendingBanner taxYear={slips[0].tax_year} />}
          {slips.map((slip) => (
            <Card key={slip.id} className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold">{slip.name}</p>
                  <p className="text-xs text-fg-subtle">
                    {formatMonth(slip.period_start.slice(0, 7))}
                    {slip.run_kind === "adjustment" ? " · correction" : ""}
                  </p>
                </div>
                <Button variant="subtle" onClick={() => download(slip.id)} disabled={busy === slip.id} aria-label="Download payslip PDF">
                  <Download size={16} aria-hidden /> PDF
                </Button>
              </div>

              <div className="space-y-1.5 border-t border-line pt-3 text-sm">
                {slip.lines.filter((l) => l.kind !== "employer_contribution").map((l, i) => (
                  <Line key={`${l.code}-${i}`} label={l.name}
                        value={l.kind === "deduction" ? `−${money(l.amount_minor)}` : money(l.amount_minor)} />
                ))}
                {slip.absent_days > 0 && <Line label="Days absent" value={String(slip.absent_days)} muted />}
              </div>

              <div className="flex items-baseline justify-between border-t border-line pt-3">
                <span className="text-sm font-semibold">Net pay</span>
                <span className="text-xl font-semibold tabular-nums text-brand">{money(slip.net_minor)}</span>
              </div>
            </Card>
          ))}
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
