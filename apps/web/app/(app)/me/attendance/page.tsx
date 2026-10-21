"use client";

import { useCallback, useEffect, useState } from "react";
import type { Attendance, Correction } from "@business-os/types";
import { api } from "@/lib/api";
import { attendanceBadge, formatDay, formatTime } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { DataTable, type Column } from "@/components/DataTable";
import { Dialog } from "@/components/Dialog";
import { Badge, Button, EmptyState, ErrorState, Field, Input } from "@/components/ui";

const timeOf = (iso: string | null) => (iso ? formatTime(iso) : "—");
// work_date is a plain date; formatted as written so it can't slip to the day before.
const dateOf = (d: string) => formatDay(d, { weekday: "short", day: "numeric", month: "short" });
const corrTone = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" } as const;

/** A local "HH:MM" on a work day, as an instant with Pakistan's offset. */
const instant = (day: string, hhmm: string) => (hhmm ? `${day}T${hhmm}:00+05:00` : null);

export default function MyAttendance() {
  const [rows, setRows] = useState<Attendance[] | null>(null); // null = loading
  const [error, setError] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [fixing, setFixing] = useState<Attendance | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<Attendance[]>("/me/attendance").then(setRows).catch((e) => setError(errorText(e, "Couldn't load your attendance.")));
    api<Correction[]>("/me/attendance/corrections").then(setCorrections).catch(() => setCorrections([]));
  }, []);
  useEffect(load, [load]);

  const pendingFor = new Set(corrections.filter((c) => c.status === "pending").map((c) => c.work_date));

  const columns: Column<Attendance>[] = [
    { key: "date", header: "Date", primary: true, cell: (r) => <span className="font-medium">{dateOf(r.work_date)}</span> },
    {
      key: "status", header: "Status",
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={attendanceBadge(r.status).tone}>{attendanceBadge(r.status).label}</Badge>
          {r.auto_closed && <Badge tone="warning">closed automatically</Badge>}
          {!r.auto_closed && r.missing_checkout && <Badge tone="warning">no check-out</Badge>}
          {r.corrected && <Badge tone="brand">corrected</Badge>}
        </span>
      ),
    },
    { key: "in", header: "In", cell: (r) => <span className="tabular-nums text-fg-muted">{timeOf(r.check_in)}</span> },
    { key: "out", header: "Out", cell: (r) => <span className="tabular-nums text-fg-muted">{timeOf(r.check_out)}</span> },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="mb-4 text-sm text-fg-muted">This month, newest first. Forgot to clock out, or clocked in late by mistake? Ask for a correction.</p>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows ?? []}
            rowKey={(r) => r.id}
            loading={!rows}
            caption="My attendance this month"
            actions={(r) => r.locked ? null : pendingFor.has(r.work_date)
              ? <span className="text-xs text-fg-subtle">Correction asked</span>
              : <Button size="sm" variant="ghost" onClick={() => setFixing(r)} aria-label={`Ask to correct ${r.work_date}`}>Ask to correct</Button>}
            empty={<EmptyState title="No attendance recorded yet this month." />}
          />
        )}
      </div>

      {corrections.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">My correction requests</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {corrections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                <span className="w-28 shrink-0 tabular-nums text-fg-muted">{dateOf(c.work_date)}</span>
                <span className="min-w-0 flex-1 basis-40 break-words">
                  {c.requested_in && `In ${timeOf(c.requested_in)} `}{c.requested_out && `Out ${timeOf(c.requested_out)}`}
                  <span className="text-fg-subtle"> · {c.reason}</span>
                </span>
                <Badge tone={corrTone[c.status]}>{c.status}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fixing && <CorrectionDialog day={fixing} onClose={() => setFixing(null)} onSaved={load} />}
    </div>
  );
}

function CorrectionDialog({ day, onClose, onSaved }: { day: Attendance; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ in: "", out: "", reason: "" });
  const save = useAction(
    () => api("/me/attendance/corrections", {
      method: "POST",
      body: JSON.stringify({
        work_date: day.work_date, reason: f.reason,
        requested_in: instant(day.work_date, f.in), requested_out: instant(day.work_date, f.out),
      }),
    }),
    { success: "Sent to your manager", failure: "Couldn't send that request" },
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
      title={`Correct ${dateOf(day.work_date)}`}
      description="Give the right time for whichever is wrong. Your manager or HR approves it; nothing is changed until then."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="correction" disabled={save.busy || !f.reason.trim() || (!f.in && !f.out)}>
            {save.busy ? "Sending…" : "Send request"}
          </Button>
        </>
      }
    >
      <form id="correction" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Check-in time"><Input type="time" value={f.in} onChange={(e) => setF({ ...f, in: e.target.value })} /></Field>
        <Field label="Check-out time"><Input type="time" value={f.out} onChange={(e) => setF({ ...f, out: e.target.value })} /></Field>
        <div className="sm:col-span-2">
          <Field label="Why"><Input value={f.reason} required maxLength={500} placeholder="e.g. Forgot to clock out"
                                    onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        </div>
      </form>
    </Dialog>
  );
}
