"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Employee, Leave, LeaveBalanceV2, LeaveType } from "@business-os/types";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { errorText, useAction } from "@/lib/useAction";
import { useConfirm } from "@/components/Confirm";
import { DataTable, type Column } from "@/components/DataTable";
import { Dialog } from "@/components/Dialog";
import { CompOffApprovals } from "@/components/hrms/CompOff";
import { LeaveRequestForm, daysLabel, halvesLabel, leaveTone, stepLabel, type LeaveDraft } from "@/components/hrms/LeaveRequestForm";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Select, Switch, cx } from "@/components/ui";
import { useHrmsSummary } from "../summary";

type Filter = "all" | "leave" | "wfh";
const FILTER_LABEL: Record<Filter, string> = { all: "All", leave: "Leave", wfh: "Work from home" };
const APPROVAL: Record<LeaveType["approval"], string> = {
  none: "No approval", manager: "Manager", hr: "HR", manager_then_hr: "Manager, then HR",
};
const GRANT: Record<LeaveType["grant_mode"], string> = {
  annual_upfront: "All at the start of the year", monthly_accrual: "Earned monthly", none: "No balance",
};

export default function LeavePage() {
  const { refresh: refreshSummary } = useHrmsSummary();
  const [items, setItems] = useState<Leave[] | null>(null); // null = loading
  const [loadError, setLoadError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [balances, setBalances] = useState<LeaveBalanceV2[]>([]);
  const [balancesError, setBalancesError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [lv, emp, lt] = await Promise.all([
        api<Leave[]>("/hrms/leave"), api<Employee[]>("/hrms/employees"), api<LeaveType[]>("/hrms/leave-types"),
      ]);
      setItems(lv);
      setEmployees(emp);
      setTypes(lt);
      setEmployeeId((id) => id || emp[0]?.id || "");
    } catch (e) {
      setLoadError(errorText(e, "Couldn't load leave requests."));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Balances for whoever the request is being made for — the number the
  // approver needs at the moment of deciding. Read from the leave ledger.
  const loadBalances = useCallback(() => {
    if (!employeeId) return;
    setBalancesError(null);
    api<LeaveBalanceV2[]>(`/hrms/leave/balances?employee_id=${employeeId}`)
      .then(setBalances)
      // Said, not swallowed: an approver deciding blind should know the numbers are missing.
      .catch((e) => { setBalances([]); setBalancesError(errorText(e, "Couldn't load leave balances.")); });
  }, [employeeId]);
  useEffect(() => { loadBalances(); }, [loadBalances, items]);

  const shown = useMemo(
    () => (items ?? []).filter((l) => filter === "all" || l.request_type === filter),
    [items, filter],
  );
  const pendingCount = (items ?? []).filter((l) => l.status === "pending").length;

  // One in-flight decision at a time across the list: Approve and Reject can't
  // both go out for the same request, and a double tap can't approve twice.
  // A refusal (not enough balance, your own leave, the manager step) is shown
  // once, in the toast.
  const decision = useAction(
    (id: string, d: "approve" | "reject") => api<Leave>(`/hrms/leave/${id}/${d}`, { method: "POST" }),
    { success: (l) => `Request ${stepLabel(l as Leave)}`, failure: "Couldn't update that request" },
  );
  async function decide(id: string, d: "approve" | "reject") {
    setDeciding(`${id}:${d}`);
    await decision.run(id, d);
    setDeciding(null);
    load(); // even on failure: it may have been decided by someone else meanwhile
    refreshSummary();
  }

  const cancelAction = useAction(
    (l: Leave) => api<Leave>(`/hrms/leave/${l.id}/cancel`, { method: "POST" }),
    { success: "Request cancelled", failure: "Couldn't cancel that request" },
  );
  function onCancel(l: Leave) {
    void confirm({
      title: `Cancel ${l.employee_name}'s leave?`,
      body: "The days go back to their balance. Leave already in a locked payroll run can't be cancelled.",
      confirmLabel: "Cancel leave",
      cancelLabel: "Keep it",
      busyLabel: "Cancelling…",
      tone: "danger",
      run: async () => { const done = (await cancelAction.run(l)) !== undefined; load(); return done; },
    });
  }

  const submit = useAction(
    (d: LeaveDraft) => api("/hrms/leave", { method: "POST", body: JSON.stringify({ ...d, employee_id: employeeId }) }),
    { success: "Request submitted", failure: "Couldn't submit that request" },
  );
  async function request(d: LeaveDraft) {
    const ok = (await submit.run(d)) !== undefined;
    if (ok) { load(); refreshSummary(); }
    return ok;
  }

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
        : <span className="text-fg-muted">{l.leave_type_name || l.leave_type}{l.paid === false && " (unpaid)"}</span>,
    },
    {
      // wrap: a 320px card is too narrow for both dates on one line, and the
      // truncated cell hid the end date. Each date stays whole; the line breaks
      // at the arrow. One line in the table.
      key: "dates", header: "Dates", wrap: true,
      cell: (l) => (
        <span className="tabular-nums text-fg-muted sm:whitespace-nowrap">
          <span className="whitespace-nowrap">{l.from_date}</span>
          {l.to_date !== l.from_date && <> → <span className="whitespace-nowrap">{l.to_date}</span></>}
          {(halvesLabel(l) || l.duration_days) && (
            <span className="block text-xs text-fg-subtle">{[daysLabel(l.duration_days), halvesLabel(l)].filter(Boolean).join(" · ")}</span>
          )}
        </span>
      ),
    },
    { key: "status", header: "Status", cell: (l) => <Badge tone={leaveTone[l.status]}>{stepLabel(l)}</Badge> },
  ];

  function actions(l: Leave) {
    if (l.status === "approved") {
      return (
        <Can perm="hrms.leave.approve">
          <Button size="sm" variant="ghost" onClick={() => onCancel(l)} aria-label={`Cancel ${l.employee_name}'s leave`}>Cancel</Button>
        </Can>
      );
    }
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
    <div className="space-y-8">
      <CompOffApprovals leaveTypes={types.filter((t) => t.active)} />
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
              <span className="ms-auto text-xs text-fg-subtle">{pendingCount} awaiting approval</span>
            )}
          </div>

          {loadError ? (
            <ErrorState message={loadError} onRetry={load} />
          ) : (
            <DataTable
              columns={columns}
              rows={shown}
              rowKey={(l) => l.id}
              actions={actions}
              loading={!items}
              caption="Leave and work-from-home requests"
              empty={<EmptyState title={filter === "all" ? "No requests yet" : `No ${FILTER_LABEL[filter].toLowerCase()} requests`} />}
            />
          )}
        </div>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">New request</h2>
          <LeaveRequestForm types={types} busy={submit.busy} onSubmit={request} submitLabel="Submit request">
            <Field label="Employee">
              <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>
            {balancesError && <p role="status" className="text-xs text-warning">{balancesError}</p>}
            {balances.length > 0 && (
              <div className="flex gap-1.5" role="group" aria-label="Leave balances this year">
                {balances.map((b) => (
                  <span
                    key={b.leave_type}
                    className={`min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-center ${
                      b.remaining <= 0 ? "border-danger/40 bg-danger/5" : "border-line bg-elevated/40"
                    }`}
                  >
                    <span className="block text-sm font-semibold tabular-nums">{b.remaining}<span className="text-fg-subtle">/{b.quota}</span></span>
                    <span className="block truncate text-[10px] text-fg-subtle">{b.name || b.leave_type} left</span>
                  </span>
                ))}
              </div>
            )}
            <Can perm="hrms.leave.adjust">
              <button type="button" className="text-xs text-brand hover:underline" onClick={() => setAdjusting(true)}>Adjust a balance…</button>
            </Can>
          </LeaveRequestForm>
        </Card>
      </div>

      <section className="space-y-2" aria-labelledby="leave-types-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="leave-types-h" className="text-sm font-semibold">Leave types</h2>
          <p className="text-xs text-fg-subtle">Starting points from common Pakistani practice. Check them against your province&apos;s law and change what differs.</p>
        </div>
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {types.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
              <span className="min-w-0 flex-1 basis-48">
                <span className="font-medium">{t.name}</span>{!t.active && <span className="text-fg-subtle"> · off</span>}
                <span className="block text-xs text-fg-subtle">
                  {t.requires_balance ? `${t.days_per_year} days · ${GRANT[t.grant_mode]}` : GRANT.none}
                  {t.carry_forward !== "none" && ` · carry ${t.carry_forward === "all" ? "all" : `up to ${t.carry_cap_days}`}`}
                  {` · ${APPROVAL[t.approval]}`}{!t.paid && " · unpaid"}
                </span>
              </span>
              <Can perm="hrms.settings.manage">
                <Button size="sm" variant="subtle" onClick={() => setEditing(t)} aria-label={`Edit ${t.code} settings`}>Edit</Button>
              </Can>
            </li>
          ))}
        </ul>
      </section>

      {editing && <EditLeaveType t={editing} onClose={() => setEditing(null)} onSaved={load} />}
      {adjusting && (
        <AdjustBalance employees={employees} types={types.filter((t) => t.requires_balance)} employeeId={employeeId}
                       onClose={() => setAdjusting(false)} onSaved={loadBalances} />
      )}
    </div>
  );
}

function EditLeaveType({ t, onClose, onSaved }: { t: LeaveType; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ ...t });
  const save = useAction(
    () => api(`/hrms/leave-types/${t.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: f.name, paid: f.paid, active: f.active, approval: f.approval, grant_mode: f.grant_mode,
        days_per_year: Number(f.days_per_year), carry_forward: f.carry_forward, carry_cap_days: Number(f.carry_cap_days),
        carry_expires_after_months: f.carry_expires_after_months || null, allow_half_day: f.allow_half_day,
        cycle_start_month: Number(f.cycle_start_month), allow_negative_days: Number(f.allow_negative_days),
      }),
    }),
    { success: "Leave type saved", failure: "Couldn't save the leave type" },
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((await save.run()) === undefined) return;
    onSaved();
    onClose();
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Edit ${t.name}`}
      description={t.statutory_note || undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="edit-leave-type" disabled={save.busy || !f.name.trim()}>{save.busy ? "Saving…" : "Save"}</Button>
        </>
      }
    >
      <form id="edit-leave-type" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={f.name} required onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Approval">
          <Select value={f.approval} onChange={(e) => setF({ ...f, approval: e.target.value as LeaveType["approval"] })}>
            {Object.entries(APPROVAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        {t.requires_balance && (
          <>
            <Field label="Days a year"><Input type="number" min={0} max={366} step={0.5} value={f.days_per_year} onChange={(e) => setF({ ...f, days_per_year: Number(e.target.value) })} /></Field>
            <Field label="How it's given">
              <Select value={f.grant_mode} onChange={(e) => setF({ ...f, grant_mode: e.target.value as LeaveType["grant_mode"] })}>
                <option value="annual_upfront">{GRANT.annual_upfront}</option>
                <option value="monthly_accrual">{GRANT.monthly_accrual}</option>
              </Select>
            </Field>
            <Field label="Leave year starts">
              <Select value={f.cycle_start_month} onChange={(e) => setF({ ...f, cycle_start_month: Number(e.target.value) })}>
                <option value={1}>January</option>
                <option value={7}>July (fiscal year)</option>
              </Select>
            </Field>
            <Field label="Unused days">
              <Select value={f.carry_forward} onChange={(e) => setF({ ...f, carry_forward: e.target.value as LeaveType["carry_forward"] })}>
                <option value="none">Lapse at year end</option>
                <option value="capped">Carry forward, up to a limit</option>
                <option value="all">Carry all forward</option>
              </Select>
            </Field>
            {f.carry_forward === "capped" && (
              <Field label="Carry at most (days)"><Input type="number" min={0} max={366} step={0.5} value={f.carry_cap_days} onChange={(e) => setF({ ...f, carry_cap_days: Number(e.target.value) })} /></Field>
            )}
            {f.carry_forward !== "none" && (
              <Field label="Carried days expire after (months)">
                <Input type="number" min={1} max={12} value={f.carry_expires_after_months ?? ""} placeholder="Never"
                       onChange={(e) => setF({ ...f, carry_expires_after_months: e.target.value ? Number(e.target.value) : null })} />
              </Field>
            )}
            <Field label="May go below zero by (days)"><Input type="number" min={0} max={366} step={0.5} value={f.allow_negative_days} onChange={(e) => setF({ ...f, allow_negative_days: Number(e.target.value) })} /></Field>
          </>
        )}
        <div className="space-y-2 sm:col-span-2">
          <div className="flex items-center gap-2 text-sm"><Switch checked={f.paid} onChange={(v) => setF({ ...f, paid: v })} label="Paid" />Paid</div>
          <div className="flex items-center gap-2 text-sm"><Switch checked={f.allow_half_day} onChange={(v) => setF({ ...f, allow_half_day: v })} label="Half days allowed" />Half days allowed</div>
          <div className="flex items-center gap-2 text-sm"><Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="In use" />In use</div>
        </div>
      </form>
    </Dialog>
  );
}

function AdjustBalance({ employees, types, employeeId, onClose, onSaved }: {
  employees: Employee[]; types: LeaveType[]; employeeId: string; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({ employee_id: employeeId, leave_type_id: types[0]?.id ?? "", days: "", note: "" });
  const save = useAction(
    () => api("/hrms/leave/ledger/adjust", { method: "POST", body: JSON.stringify({ ...f, days: Number(f.days) }) }),
    { success: "Balance adjusted", failure: "Couldn't adjust the balance" },
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((await save.run()) === undefined) return;
    onSaved();
    onClose();
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Adjust a leave balance"
      description="Adds an entry to the leave record with your reason; nothing earlier is changed."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="adjust-balance" disabled={save.busy || !f.note.trim() || !Number(f.days)}>{save.busy ? "Saving…" : "Adjust"}</Button>
        </>
      }
    >
      <form id="adjust-balance" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Employee">
          <Select value={f.employee_id} onChange={(e) => setF({ ...f, employee_id: e.target.value })}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <Field label="Leave type">
          <Select value={f.leave_type_id} onChange={(e) => setF({ ...f, leave_type_id: e.target.value })}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Days (minus to take away)"><Input type="number" step={0.5} value={f.days} required onChange={(e) => setF({ ...f, days: e.target.value })} /></Field>
        <Field label="Reason"><Input value={f.note} required maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </form>
    </Dialog>
  );
}
