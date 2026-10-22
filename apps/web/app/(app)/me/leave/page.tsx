"use client";

import { useCallback, useEffect, useState } from "react";
import type { Leave, LeaveBalanceV2, LeaveType } from "@business-os/types";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { useConfirm } from "@/components/Confirm";
import { DataTable, type Column } from "@/components/DataTable";
import { LeaveRequestForm, daysLabel, halvesLabel, leaveTone, stepLabel, type LeaveDraft } from "@/components/hrms/LeaveRequestForm";
import { MyCompOff } from "@/components/hrms/CompOff";
import { Badge, Button, Card, EmptyState, ErrorState } from "@/components/ui";

const day = (d: string) => formatDay(d, { day: "numeric", month: "short" });

export default function MyLeave() {
  const [items, setItems] = useState<Leave[] | null>(null); // null = loading
  const [loadError, setLoadError] = useState<string | null>(null);
  const [balances, setBalances] = useState<LeaveBalanceV2[]>([]);
  const [balancesError, setBalancesError] = useState<string | null>(null);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const confirm = useConfirm();

  const load = useCallback(() => {
    setLoadError(null);
    api<Leave[]>("/me/leave").then(setItems).catch((e) => setLoadError(errorText(e, "Couldn't load your requests.")));
    setBalancesError(null);
    api<LeaveBalanceV2[]>("/me/leave/balances").then(setBalances)
      .catch((e) => { setBalances([]); setBalancesError(errorText(e, "Couldn't load your leave balances.")); });
    api<LeaveType[]>("/me/leave-types").then(setTypes).catch(() => setTypes([]));
  }, []);
  useEffect(load, [load]);

  // Busy-guarded: a double tap filed two identical requests before. The
  // server's reason (overlap, a blackout, half-day rules) comes back in the toast.
  const submitAction = useAction(
    // employee_id is ignored server-side and forced to the caller.
    (d: LeaveDraft) => api("/me/leave", { method: "POST", body: JSON.stringify({ ...d, employee_id: "self" }) }),
    { success: "Request submitted — your manager will review it.", failure: "Couldn't submit that request" },
  );
  async function submit(d: LeaveDraft) {
    const ok = (await submitAction.run(d)) !== undefined;
    if (ok) load();
    return ok;
  }

  const cancelAction = useAction(
    (l: Leave) => api(`/me/leave/${l.id}/cancel`, { method: "POST" }),
    { success: "Request cancelled", failure: "Couldn't cancel that request" },
  );
  function onCancel(l: Leave) {
    void confirm({
      title: "Cancel this request?",
      body: l.status === "approved" ? "The days go back to your balance." : "Your manager won't see it any more.",
      confirmLabel: "Cancel request",
      cancelLabel: "Keep it",
      busyLabel: "Cancelling…",
      tone: "danger",
      run: async () => { const done = (await cancelAction.run(l)) !== undefined; load(); return done; },
    });
  }

  const columns: Column<Leave>[] = [
    {
      key: "type", header: "Type", primary: true,
      cell: (l) => l.request_type === "wfh" ? <Badge tone="brand">Work from home</Badge>
        : <span>{l.leave_type_name || l.leave_type}</span>,
    },
    {
      key: "dates", header: "Dates",
      cell: (l) => (
        <span className="whitespace-nowrap tabular-nums text-fg-muted">
          {l.from_date === l.to_date ? day(l.from_date) : `${day(l.from_date)} → ${day(l.to_date)}`}
          {halvesLabel(l) && <span className="text-fg-subtle"> · {halvesLabel(l)}</span>}
        </span>
      ),
    },
    { key: "days", header: "Days", cell: (l) => <span className="tabular-nums">{daysLabel(l.duration_days)}</span> },
    { key: "status", header: "Status", cell: (l) => <Badge tone={leaveTone[l.status]}>{stepLabel(l)}</Badge> },
  ];

  return (
    <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        {loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : (
          <DataTable
            columns={columns}
            rows={items ?? []}
            rowKey={(l) => l.id}
            loading={!items}
            caption="My leave and work-from-home requests"
            actions={(l) => (l.status === "pending" || l.status === "approved") ? (
              <Button size="sm" variant="ghost" onClick={() => onCancel(l)} aria-label={`Cancel request from ${l.from_date}`}>Cancel</Button>
            ) : null}
            empty={<EmptyState title="No requests yet." hint="Use the form to ask for leave or a work-from-home day." />}
          />
        )}
      </div>

      <div className="space-y-4">
        {balancesError && <p role="status" className="text-sm text-warning">{balancesError}</p>}
        <div className="grid grid-cols-3 gap-2">
          {balances.map((b) => (
            <Card key={b.leave_type} className="p-3 text-center">
              <p className="text-lg font-semibold tabular-nums">{b.remaining}</p>
              <p className="text-[10px] text-fg-subtle">{b.name || b.leave_type} left</p>
              {b.pending > 0 && <p className="text-[10px] text-warning">{b.pending} pending</p>}
            </Card>
          ))}
        </div>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">New request</h2>
          <LeaveRequestForm types={types} busy={submitAction.busy} onSubmit={submit} />
        </Card>
        <MyCompOff />
      </div>
    </div>
  );
}
