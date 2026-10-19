"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LEAVE_TYPES, type Employee, type Leave } from "@business-os/types";
import { api } from "@/lib/api";
import { errorText, useAction } from "@/lib/useAction";
import { DataTable, type Column } from "@/components/DataTable";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Select, cx } from "@/components/ui";
import { useHrmsSummary } from "../summary";

const tone = { pending: "warning", approved: "success", rejected: "danger" } as const;
const blank = { employee_id: "", request_type: "leave", leave_type: "annual", from_date: "", to_date: "", reason: "" };

type Filter = "all" | "leave" | "wfh";
const FILTER_LABEL: Record<Filter, string> = { all: "All", leave: "Leave", wfh: "Work from home" };

interface Balance {
  leave_type: string;
  quota: number;
  used: number;
  remaining: number;
}

export default function LeavePage() {
  const { refresh: refreshSummary } = useHrmsSummary();
  const [items, setItems] = useState<Leave[] | null>(null); // null = loading
  const [loadError, setLoadError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState(blank);
  const [filter, setFilter] = useState<Filter>("all");
  const [balances, setBalances] = useState<Balance[]>([]);
  const [deciding, setDeciding] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [lv, emp] = await Promise.all([api<Leave[]>("/hrms/leave"), api<Employee[]>("/hrms/employees")]);
      setItems(lv);
      setEmployees(emp);
      setForm((f) => ({ ...f, employee_id: f.employee_id || emp[0]?.id || "" }));
    } catch (e) {
      setLoadError(errorText(e, "Couldn't load leave requests."));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Balances for whoever the request is being made for — the number the
  // approver needs at the moment of deciding.
  useEffect(() => {
    if (!form.employee_id) return;
    api<Balance[]>(`/hrms/leave/balances?employee_id=${form.employee_id}`)
      .then(setBalances)
      .catch(() => setBalances([]));
  }, [form.employee_id, items]);

  const shown = useMemo(
    () => (items ?? []).filter((l) => filter === "all" || l.request_type === filter),
    [items, filter],
  );
  const pendingCount = (items ?? []).filter((l) => l.status === "pending").length;

  // One in-flight decision at a time across the list: Approve and Reject can't
  // both go out for the same request, and a double tap can't approve twice.
  // A refusal (e.g. "That's 25 working days of annual leave, but only 14
  // remain…") is shown once, in the toast.
  const decision = useAction(
    (id: string, d: "approve" | "reject") => api<Leave>(`/hrms/leave/${id}/${d}`, { method: "POST" }),
    { success: (l) => `Request ${(l as Leave).status}`, failure: "Couldn't update that request" },
  );

  async function decide(id: string, d: "approve" | "reject") {
    setDeciding(`${id}:${d}`);
    await decision.run(id, d);
    setDeciding(null);
    load(); // even on failure: it may have been decided by someone else meanwhile
    refreshSummary();
  }

  const submit = useAction(
    () => api("/hrms/leave", { method: "POST", body: JSON.stringify(form) }),
    { success: "Request submitted", failure: "Couldn't submit that request" },
  );

  async function request(e: React.FormEvent) {
    e.preventDefault();
    if ((await submit.run()) === undefined) return;
    setForm({ ...blank, employee_id: form.employee_id });
    load();
    refreshSummary();
  }

  const isWfh = form.request_type === "wfh";

  const columns: Column<Leave>[] = [
    {
      key: "employee", header: "Employee", primary: true,
      cell: (l) => (
        <div className="min-w-0">
          <p className="font-medium">{l.employee_name}</p>
          {/* Two lines at most, wrapping rather than widening the table; the full text is in the tooltip. */}
          {l.reason && <p title={l.reason} className="line-clamp-2 max-w-xs whitespace-normal break-words text-xs font-normal text-fg-subtle">{l.reason}</p>}
        </div>
      ),
    },
    {
      key: "type", header: "Type",
      cell: (l) => l.request_type === "wfh"
        ? <Badge tone="brand">Work from home</Badge>
        : <span className="capitalize text-fg-muted">{l.leave_type}</span>,
    },
    { key: "dates", header: "Dates", cell: (l) => <span className="whitespace-nowrap tabular-nums text-fg-muted">{l.from_date} → {l.to_date}</span> },
    { key: "status", header: "Status", cell: (l) => <Badge tone={tone[l.status]}>{l.status}</Badge> },
  ];

  function actions(l: Leave) {
    if (l.status !== "pending") return null;
    return (
      <>
        <Button size="sm" onClick={() => decide(l.id, "approve")} disabled={decision.busy} aria-label={`Approve ${l.employee_name}'s request`}>
          {deciding === `${l.id}:approve` ? "Approving…" : "Approve"}
        </Button>
        <Button size="sm" variant="subtle" onClick={() => decide(l.id, "reject")} disabled={decision.busy} aria-label={`Reject ${l.employee_name}'s request`}>
          {deciding === `${l.id}:reject` ? "Rejecting…" : "Reject"}
        </Button>
      </>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-1">
          {(["all", "leave", "wfh"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cx(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors pointer-coarse:min-h-11 pointer-coarse:text-sm",
                filter === f ? "bg-elevated text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {FILTER_LABEL[f]}
            </button>
          ))}
          {pendingCount > 0 && (
            <span className="ml-auto text-xs text-fg-subtle">{pendingCount} awaiting approval</span>
          )}
        </div>

        {loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : (
          <DataTable
            columns={columns}
            rows={shown}
            rowKey={(l) => l.id}
            actions={pendingCount > 0 ? actions : undefined}
            loading={!items}
            caption="Leave and work-from-home requests"
            empty={<EmptyState title={filter === "all" ? "No requests yet" : `No ${FILTER_LABEL[filter].toLowerCase()} requests`} />}
          />
        )}
      </div>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">New request</h2>
        <form onSubmit={request} className="space-y-3">
          <Field label="Employee">
            <Select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
          {balances.length > 0 && (
            <div className="flex gap-1.5" role="group" aria-label="Leave balances this year">
              {balances.map((b) => (
                <span
                  key={b.leave_type}
                  className={`min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-center ${
                    b.remaining === 0 ? "border-danger/40 bg-danger/5" : "border-line bg-elevated/40"
                  }`}
                >
                  <span className="block text-sm font-semibold tabular-nums">{b.remaining}<span className="text-fg-subtle">/{b.quota}</span></span>
                  <span className="block truncate text-[10px] capitalize text-fg-subtle">{b.leave_type} left</span>
                </span>
              ))}
            </div>
          )}
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
            <Field label="From"><Input type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} required /></Field>
            <Field label="To"><Input type="date" value={form.to_date} min={form.from_date || undefined} onChange={(e) => setForm({ ...form, to_date: e.target.value })} required /></Field>
          </div>
          <Field label="Reason"><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
          {isWfh && (
            <p className="rounded-lg bg-brand-subtle/50 px-3 py-2 text-xs text-fg-muted">
              Approved work-from-home days count as worked — pay is never deducted for them.
            </p>
          )}
          <Button type="submit" disabled={!form.employee_id || submit.busy} className="w-full">
            {submit.busy ? "Submitting…" : "Submit request"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
