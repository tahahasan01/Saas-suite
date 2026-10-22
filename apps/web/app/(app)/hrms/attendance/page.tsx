"use client";

import type { Schema } from "@business-os/api-client";
import { useCallback, useEffect, useState } from "react";
import type { Attendance, AttendanceWeek, AttendanceWeekRow, Correction, Employee } from "@business-os/types";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { attendanceBadge, formatDay, formatTime } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { DataTable, type Column } from "@/components/DataTable";
import { Badge, Button, EmptyState, ErrorState, cx } from "@/components/ui";
import { useHrmsSummary } from "../summary";

const time = (iso: string | null) => (iso ? formatTime(iso) : "—");

export default function AttendancePage() {
  const { refresh: refreshSummary } = useHrmsSummary();
  // null = loading. An empty roster and a roster still on its way are different answers.
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [att, setAtt] = useState<Record<string, Attendance>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [week, setWeek] = useState<AttendanceWeek | null>(null);
  const [weekError, setWeekError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const loadWeek = useCallback(() => {
    setWeekError(null);
    api<AttendanceWeek>("/hrms/attendance/week")
      .then(setWeek)
      .catch((e) => setWeekError(errorText(e, "Couldn't load this week.")));
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [emp, rows] = await Promise.all([
        api<Employee[]>("/hrms/employees"),
        api<Attendance[]>("/hrms/attendance"),
      ]);
      setEmployees(emp);
      setAtt(Object.fromEntries(rows.map((r) => [r.employee_id, r])));
    } catch (e) {
      setLoadError(errorText(e, "Couldn't load today's attendance."));
    }
    loadWeek();
  }, [loadWeek]);
  useEffect(() => { load(); }, [load]);

  // One action for every row: while one check-in is in flight the others wait,
  // so a double tap can't record two. Geofence and fraud refusals come back as
  // the server's own words in the toast.
  const clock = useAction(
    (id: string, kind: "checkin" | "checkout") =>
      api(`/hrms/attendance/${kind}`, {
        method: "POST",
        body: JSON.stringify(kind === "checkin" ? { employee_id: id, method: "web" } : { employee_id: id }),
      }),
    { failure: "Couldn't record that" },
  );

  async function mark(id: string, kind: "checkin" | "checkout") {
    setPendingId(id);
    const ok = await clock.run(id, kind);
    setPendingId(null);
    if (ok === undefined) return;
    load();
    refreshSummary();
  }

  const columns: Column<Employee>[] = [
    { key: "name", header: "Employee", primary: true, cell: (e) => <span className="font-medium">{e.name}</span> },
    {
      key: "status", header: "Status",
      cell: (e) => {
        const a = att[e.id];
        if (!a) return <span className="text-fg-subtle">Not in</span>;
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={attendanceBadge(a.status).tone}>{attendanceBadge(a.status).label}</Badge>
            {a.fraud_flag && <Badge tone="danger">⚠ {a.fraud_flag.replace(/_/g, " ")}</Badge>}
            {a.geo_status === "outside" && <Badge tone="warning">outside the site</Badge>}
            {a.geo_status === "no_fix" && <Badge>no location</Badge>}
            {a.ip_status === "outside" && <Badge tone="warning">off network</Badge>}
            {a.auto_closed ? <Badge tone="warning">closed automatically</Badge>
              : a.missing_checkout && <Badge tone="warning">no check-out</Badge>}
            {a.corrected && <Badge tone="brand">corrected</Badge>}
            {!!a.overtime_min && <Badge tone="brand">+{a.overtime_min} min overtime</Badge>}
          </span>
        );
      },
    },
    { key: "in", header: "In", cell: (e) => <span className="tabular-nums text-fg-muted">{time(att[e.id]?.check_in ?? null)}</span> },
    { key: "out", header: "Out", cell: (e) => <span className="tabular-nums text-fg-muted">{time(att[e.id]?.check_out ?? null)}</span> },
  ];

  function action(e: Employee) {
    const a = att[e.id];
    const mine = pendingId === e.id;
    if (!a?.check_in) {
      return (
        <Button size="sm" onClick={() => mark(e.id, "checkin")} disabled={clock.busy} aria-label={`Check in ${e.name}`}>
          {mine ? "Checking in…" : "Check in"}
        </Button>
      );
    }
    if (!a.check_out) {
      return (
        <Button size="sm" variant="subtle" onClick={() => mark(e.id, "checkout")} disabled={clock.busy} aria-label={`Check out ${e.name}`}>
          {mine ? "Checking out…" : "Check out"}
        </Button>
      );
    }
    return <span className="text-xs text-fg-subtle">Done</span>;
  }

  return (
    <div className="space-y-5">
      <Corrections onDecided={load} />
      <OvertimeClaims />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Today</h2>
        {loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : (
          <DataTable
            columns={columns}
            rows={employees ?? []}
            rowKey={(e) => e.id}
            actions={action}
            loading={!employees}
            caption="Attendance today"
            empty={<EmptyState title="No employees yet" hint="Add staff on the Team tab to track their attendance." />}
          />
        )}
      </section>

      {weekError ? (
        <ErrorState message={weekError} onRetry={loadWeek} />
      ) : week && week.employees.length > 0 ? (
        <WeekMatrix week={week} />
      ) : null}
    </div>
  );
}

/* Overtime claims (wave A, H5): approving prices the hours once and sends
   them to that month's payroll; the amount shows only to payroll holders. */
function OvertimeClaims() {
  const [rows, setRows] = useState<Schema<"OvertimeOut">[]>([]);
  const load = useCallback(() => {
    api<Schema<"OvertimeOut">[]>("/hrms/overtime?status=pending").then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);
  const decide = useAction(
    (id: string, d: "approve" | "reject") =>
      api<Schema<"OvertimeOut">>(`/hrms/overtime/${id}/${d}`, { method: "POST", body: JSON.stringify({}) }),
    { success: (c) => `Overtime ${(c as Schema<"OvertimeOut">).status}`, failure: "Couldn't record that decision" },
  );
  async function act(id: string, d: "approve" | "reject") {
    await decide.run(id, d);
    load();
  }
  if (!rows.length) return null;
  return (
    <section className="space-y-2" aria-labelledby="overtime-h">
      <h2 id="overtime-h" className="text-sm font-semibold">Overtime claims</h2>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {rows.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
            <span className="min-w-0 flex-1 basis-56">
              <span className="font-medium">{c.employee_name}</span>{" "}
              <span className="text-fg-muted">· {formatDay(c.work_date, { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                {Math.floor(c.minutes / 60)}h {String(c.minutes % 60).padStart(2, "0")}m at ×{c.rate_multiplier}</span>
              {c.reason && <span className="block text-xs text-fg-subtle">{c.reason}</span>}
            </span>
            <Can perm="hrms.attendance.approve">
              <Button size="sm" onClick={() => act(c.id, "approve")} disabled={decide.busy} aria-label={`Approve ${c.employee_name}'s overtime`}>Approve</Button>
              <Button size="sm" variant="subtle" onClick={() => act(c.id, "reject")} disabled={decide.busy} aria-label={`Reject ${c.employee_name}'s overtime`}>Reject</Button>
            </Can>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* Staff asking to fix a day (a forgotten check-out, a wrong time). Approving
   adds the corrected times to the punch log — nothing is rewritten — and the
   day is worked out again. The server refuses someone's own request. */
function Corrections({ onDecided }: { onDecided: () => void }) {
  const [rows, setRows] = useState<Correction[]>([]);
  const load = useCallback(() => {
    api<Correction[]>("/hrms/attendance/corrections?status=pending").then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);
  const decide = useAction(
    (id: string, d: "approve" | "reject") =>
      api<Correction>(`/hrms/attendance/corrections/${id}/${d}`, { method: "POST", body: JSON.stringify({}) }),
    { success: (c) => `Correction ${(c as Correction).status}`, failure: "Couldn't record that decision" },
  );
  async function act(id: string, d: "approve" | "reject") {
    await decide.run(id, d);
    load();
    onDecided();
  }
  if (!rows.length) return null;
  return (
    <section className="space-y-2" aria-labelledby="corrections-h">
      <h2 id="corrections-h" className="text-sm font-semibold">Correction requests</h2>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {rows.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
            <span className="min-w-0 flex-1 basis-56">
              <span className="font-medium">{c.employee_name}</span>{" "}
              <span className="text-fg-muted">· {formatDay(c.work_date, { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                {c.requested_in && `in ${time(c.requested_in)} `}{c.requested_out && `out ${time(c.requested_out)}`}</span>
              <span className="block text-xs text-fg-subtle">{c.reason}</span>
            </span>
            <Can perm="hrms.attendance.approve">
              <Button size="sm" onClick={() => act(c.id, "approve")} disabled={decide.busy} aria-label={`Approve ${c.employee_name}'s correction`}>Approve</Button>
              <Button size="sm" variant="subtle" onClick={() => act(c.id, "reject")} disabled={decide.busy} aria-label={`Reject ${c.employee_name}'s correction`}>Reject</Button>
            </Can>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* Rows are people, columns are the last 7 days, and one glance answers "who has
   been in this week?". The statuses come from the same derivation payroll uses,
   so this grid and the payslip can never disagree about a day. Each square
   carries a letter as well as a colour, so it reads without colour vision. */
const CELL: Record<string, { cls: string; letter: string; label: string }> = {
  present: { cls: "bg-success text-white", letter: "P", label: "Present" },
  late:    { cls: "bg-warning text-black", letter: "L", label: "Late" },
  half_day: { cls: "bg-warning/60 text-black", letter: "½", label: "Half day" },
  leave:   { cls: "bg-[var(--color-chart-2)] text-white", letter: "Lv", label: "Leave" },
  wfh:     { cls: "bg-brand text-brand-fg", letter: "W", label: "WFH" },
  holiday: { cls: "bg-line-strong text-fg", letter: "H", label: "Holiday" },
  off:     { cls: "bg-elevated text-fg-muted", letter: "O", label: "Weekly off" },
  pending: { cls: "bg-elevated text-fg-muted border border-dashed border-line-strong", letter: "?", label: "Not in yet" },
  absent:  { cls: "bg-danger text-white", letter: "A", label: "Absent" },
  none:    { cls: "text-fg-subtle", letter: "–", label: "Before joining" },
};

const dayName = (iso: string) => formatDay(iso, { weekday: "short" });

function Square({ status, day }: { status: string; day: string }) {
  const s = CELL[status] ?? CELL.none;
  // `relative` anchors the sr-only label to the square. Without it the
  // absolutely-positioned label escaped the scrolling table and pushed the
  // whole page 260px sideways on a phone.
  return (
    <span
      title={`${dayName(day)}: ${s.label}`}
      className={cx("relative inline-grid h-6 min-w-6 place-items-center rounded px-1 text-[10px] font-semibold leading-none", s.cls)}
    >
      <span aria-hidden>{s.letter}</span>
      <span className="sr-only">{s.label}</span>
    </span>
  );
}

function WeekMatrix({ week }: { week: AttendanceWeek }) {
  // Only explain the statuses actually on screen — a nine-entry legend for a
  // three-state week is noise.
  const used = [...new Set(week.employees.flatMap((e) => e.cells))].filter((s) => s !== "none");

  // A wide grid stays a table on every screen: it scrolls inside its box with
  // the names pinned, rather than turning into seven-line cards.
  const columns: Column<AttendanceWeekRow>[] = [
    { key: "name", header: "Employee", cell: (e) => <span className="font-medium">{e.name}</span> },
    ...week.days.map((d, i): Column<AttendanceWeekRow> => ({
      key: d,
      header: `${dayName(d)} ${new Date(d).getDate()}`,
      align: "center",
      className: "px-2",
      cell: (e) => <Square status={e.cells[i] ?? "none"} day={d} />,
    })),
  ];

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">This week</h2>
      <DataTable columns={columns} rows={week.employees} rowKey={(e) => e.id} mode="scroll" caption="Attendance this week" />
      <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-fg-muted" aria-label="Legend">
        {used.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span aria-hidden className={cx("inline-grid h-4 min-w-4 place-items-center rounded px-0.5 text-[9px] font-semibold leading-none", CELL[s]?.cls)}>
              {CELL[s]?.letter}
            </span>
            {CELL[s]?.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
