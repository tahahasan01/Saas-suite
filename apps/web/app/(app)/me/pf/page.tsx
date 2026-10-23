"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { errorText } from "@/lib/useAction";
import { FundSummary } from "@/components/hrms/ProvidentFund";
import { Card, EmptyState, ErrorState, LoadingRows } from "@/components/ui";

type Fund = Schema<"PfBalance">;

/** The employee's own provident fund: what they and the company paid in,
 *  month by month, and how much of the company's share is theirs yet. */
export default function MyProvidentFund() {
  const [f, setF] = useState<Fund | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Fund>("/me/pf").then(setF).catch((e) => setError(errorText(e, "Couldn't load your provident fund.")));
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!f) return <LoadingRows rows={3} label="Loading your provident fund" />;
  const empty = !f.member && f.employee_minor === 0 && f.employer_minor === 0;
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">My provident fund</h1>
      {empty ? (
        <EmptyState title="You're not in a provident fund" hint="Ask HR if your company runs one and how to join." />
      ) : (
        <Card className="space-y-3">
          <p className="text-sm text-fg-muted">
            {f.member ? `A member since ${f.joined_on ? formatDay(f.joined_on) : "—"}. Each month payroll adds your share and the company's.` : "You're no longer a member."}
          </p>
          <FundSummary f={f} self />
        </Card>
      )}
    </div>
  );
}
