"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api, apiUrl } from "@/lib/api";
import { Can } from "@/lib/can";
import { formatMonth, money } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Badge, Button, Card, ErrorState, LoadingRows } from "@/components/ui";

type Run = Schema<"RunOut">;
type RunDetail = Schema<"RunDetail">;

const TONE: Record<string, "neutral" | "warning" | "brand" | "success" | "danger"> = {
  draft: "neutral", calculating: "warning", review: "brand", approved: "success", paid: "success",
  locked: "neutral", failed: "danger",
};
const STATUS: Record<string, string> = {
  draft: "not calculated", calculating: "calculating", review: "ready to review", approved: "approved",
  paid: "paid", locked: "locked", failed: "failed",
};

/** The month's payroll run (D-40): start it, calculate (the worker does it in
 *  batches; this polls), review the payslips and download each as a PDF,
 *  then approve, mark paid and lock. Each step needs its own key. */
export function PayrollRuns({ month }: { month: string }) {
  const [run, setRun] = useState<RunDetail | null | undefined>(undefined);   // null = none this month
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const runs = await api<Run[]>("/payroll/runs");
      const mine = runs.find((r) => r.kind === "regular" && r.status !== "cancelled" && r.period_start.startsWith(month));
      setRun(mine ? await api<RunDetail>(`/payroll/runs/${mine.id}`) : null);
    } catch (e) {
      setError(errorText(e, "Couldn't load this month's payroll run."));
    }
  }, [month]);
  useEffect(() => { setRun(undefined); void load(); }, [load]);

  // The worker calculates in the background: look again until it's done.
  useEffect(() => {
    if (run?.status !== "calculating") return;
    const t = setTimeout(() => void load(), 1500);
    return () => clearTimeout(t);
  }, [run, load]);

  const step = useAction(
    async (path: string, body?: object) => api<Run>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
    { failure: "Couldn't do that" },
  );
  async function act(path: string, body?: object) {
    if ((await step.run(path, body)) !== undefined) await load();
  }
  // Payslips go by email once a run is final (0111); each one only once.
  const send = useAction(
    (runId: string) => api<{ queued: number; no_email: number; already_sent: number }>(
      `/payroll/runs/${runId}/payslips/send`, { method: "POST", body: JSON.stringify({}) }),
    {
      success: (r) => {
        const s = r as { queued: number; no_email: number; already_sent: number };
        return `Emailing ${s.queued} payslip(s)` + (s.already_sent ? `; ${s.already_sent} already sent` : "")
          + (s.no_email ? `; ${s.no_email} have no email` : "");
      },
      failure: "Couldn't send the payslips",
    },
  );
  async function start() {
    const created = await step.run("/payroll/runs", { month });
    if (created !== undefined) await act(`/payroll/runs/${created.id}/calculate`);
  }

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (run === undefined) return <LoadingRows rows={2} label="Loading the payroll run" />;

  return (
    <section aria-labelledby="run-title">
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="run-title" className="text-sm font-semibold">
          Payroll run{run ? ` ${run.number}` : ""} · {formatMonth(month)}
        </h2>
        {run && <Badge tone={TONE[run.status] ?? "neutral"}>{STATUS[run.status] ?? run.status}</Badge>}
      </div>

      {!run ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-fg-muted">The figures above are a preview. A run freezes them into payslips.</p>
          <Can perm="payroll.run.create">
            <Button disabled={step.busy} onClick={() => void start()}>{step.busy ? "Starting…" : "Run payroll"}</Button>
          </Can>
        </div>
      ) : (
        <>
          {run.status === "calculating" && (
            <p role="status" className="text-sm text-fg-muted">Calculating… {run.progress_done} of {run.progress_total} payslips</p>
          )}
          {run.error && <p role="alert" className="text-sm text-danger">{run.error}</p>}
          {run.payslips.length > 0 && (
            // Closed by default: the preview above already lists everyone.
            <details className="rounded-lg border border-line text-sm">
              <summary className="cursor-pointer px-3 py-2 font-medium">Payslips ({run.payslips.length})</summary>
              <ul className="divide-y divide-line border-t border-line" aria-label="Payslips">
                {run.payslips.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 truncate font-medium">{p.name}</span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">{money(p.net_minor)}</span>
                      <a href={apiUrl(`/payroll/runs/${run.id}/payslips/${p.id}/pdf`)} download
                         className="text-brand hover:underline" aria-label={`Payslip PDF for ${p.name}`}>PDF</a>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {(run.status === "draft" || run.status === "failed") && (
              <Can perm="payroll.run.calculate">
                <Button disabled={step.busy} onClick={() => void act(`/payroll/runs/${run.id}/calculate`)}>Calculate</Button>
              </Can>
            )}
            {run.status === "review" && (
              <Can perm="payroll.run.approve">
                <Button disabled={step.busy} onClick={() => void act(`/payroll/runs/${run.id}/approve`)}>Approve</Button>
              </Can>
            )}
            {(run.status === "approved" || run.status === "paid" || run.status === "locked") && (
              <Can perm="payroll.run.pay">
                <Button variant="subtle" disabled={send.busy} onClick={() => void send.run(run.id)}>Email payslips</Button>
              </Can>
            )}
            {run.status === "approved" && (
              <Can perm="payroll.run.pay">
                <Button disabled={step.busy} onClick={() => void act(`/payroll/runs/${run.id}/mark-paid`)}>Mark paid</Button>
              </Can>
            )}
            {run.status === "paid" && (
              <Can perm="payroll.run.lock">
                <Button variant="subtle" disabled={step.busy} onClick={() => void act(`/payroll/runs/${run.id}/lock`)}>Lock</Button>
              </Can>
            )}
          </div>
        </>
      )}
    </Card>
    </section>
  );
}
