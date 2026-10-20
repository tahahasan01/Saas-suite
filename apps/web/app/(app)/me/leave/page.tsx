"use client";

import { useCallback, useEffect, useState } from "react";
import { LEAVE_TYPES, type Leave } from "@business-os/types";
import { api } from "@/lib/api";
import { errorText, useAction } from "@/lib/useAction";
import { DataTable, type Column } from "@/components/DataTable";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Select } from "@/components/ui";

interface Balance { leave_type: string; quota: number; used: number; remaining: number }

const tone = { pending: "warning", approved: "success", rejected: "danger" } as const;
const blank = { request_type: "leave", leave_type: "annual", from_date: "", to_date: "", reason: "" };

const columns: Column<Leave>[] = [
  {
    key: "type", header: "Type", primary: true,
    cell: (l) => l.request_type === "wfh" ? <Badge tone="brand">Work from home</Badge>
      : <span className="capitalize">{l.leave_type} leave</span>,
  },
  { key: "dates", header: "Dates", cell: (l) => <span className="whitespace-nowrap tabular-nums text-fg-muted">{l.from_date} → {l.to_date}</span> },
  { key: "status", header: "Status", cell: (l) => <Badge tone={tone[l.status]}>{l.status}</Badge> },
];

export default function MyLeave() {
  const [items, setItems] = useState<Leave[] | null>(null); // null = loading
  const [loadError, setLoadError] = useState<string | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [balancesError, setBalancesError] = useState<string | null>(null);
  const [form, setForm] = useState(blank);

  const load = useCallback(() => {
    setLoadError(null);
    api<Leave[]>("/me/leave").then(setItems).catch((e) => setLoadError(errorText(e, "Couldn't load your requests.")));
    setBalancesError(null);
    api<Balance[]>("/me/leave/balances").then(setBalances)
      .catch((e) => { setBalances([]); setBalancesError(errorText(e, "Couldn't load your leave balances.")); });
  }, []);
  useEffect(load, [load]);

  // Busy-guarded: a double tap filed two identical requests before. The
  // server's reason (overlap, not enough balance) comes back in the toast.
  const submitAction = useAction(
    // employee_id is ignored server-side and forced to the caller.
    () => api("/me/leave", { method: "POST", body: JSON.stringify({ ...form, employee_id: "self" }) }),
    { success: "Request submitted — your manager will review it.", failure: "Couldn't submit that request" },
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((await submitAction.run()) === undefined) return;
    setForm(blank);
    load();
  }

  const isWfh = form.request_type === "wfh";

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
              <p className="text-[10px] capitalize text-fg-subtle">{b.leave_type} left</p>
            </Card>
          ))}
        </div>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">New request</h2>
          <form onSubmit={submit} className="space-y-3">
            <Field label="Request">
              <Select value={form.request_type} onChange={(e) => setForm({ ...form, request_type: e.target.value })}>
                <option value="leave">Leave</option>
                <option value="wfh">Work from home</option>
              </Select>
            </Field>
            {!isWfh && (
              <Field label="Leave type">
                <Select value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>
                  {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="From"><Input type="date" value={form.from_date} required onChange={(e) => setForm({ ...form, from_date: e.target.value })} /></Field>
              <Field label="To"><Input type="date" value={form.to_date} min={form.from_date || undefined} required onChange={(e) => setForm({ ...form, to_date: e.target.value })} /></Field>
            </div>
            <Field label="Reason"><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
            <Button type="submit" disabled={submitAction.busy} className="w-full">{submitAction.busy ? "Submitting…" : "Submit"}</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
