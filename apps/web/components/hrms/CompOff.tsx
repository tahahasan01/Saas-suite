"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { dayPKT } from "@/lib/dates";
import { formatDay, money } from "@/lib/format";
import { useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

type CompOff = Schema<"CompOffOut">;
type Balance = { leave_type: string; leave_type_id?: string | null; name: string; remaining: number };
const TONE = { pending: "brand", approved: "success", rejected: "danger" } as const;

/** /me/leave: ask for a day off in return for a day off you worked (wave C, H8). */
export function MyCompOff() {
  const [rows, setRows] = useState<CompOff[]>([]);
  const [f, setF] = useState({ work_date: "", days: "1", reason: "" });
  const load = useCallback(() => { api<CompOff[]>("/me/comp-off", { notify: false }).then(setRows).catch(() => setRows([])); }, []);
  useEffect(load, [load]);
  const ask = useAction(
    () => api("/me/comp-off", { method: "POST", body: JSON.stringify({ ...f, days: Number(f.days) }) }),
    { success: "Comp-off requested", failure: "Couldn't ask for it" },
  );
  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold">Worked a day off?</h2>
      <form aria-label="Ask for comp-off" className="space-y-2"
            onSubmit={async (e) => { e.preventDefault(); if ((await ask.run()) !== undefined) { setF({ work_date: "", days: "1", reason: "" }); load(); } }}>
        <Field label="Day you worked"><Input type="date" required max={dayPKT()} value={f.work_date} onChange={(e) => setF({ ...f, work_date: e.target.value })} /></Field>
        <Field label="Time off wanted">
          <Select value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })}>
            <option value="1">A full day</option><option value="0.5">Half a day</option>
          </Select>
        </Field>
        <Field label="Why you worked"><Input value={f.reason} maxLength={500} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <Button type="submit" size="sm" disabled={ask.busy || !f.work_date}>Ask for comp-off</Button>
      </form>
      {rows.length > 0 && (
        <ul className="space-y-1 text-xs" aria-label="My comp-off requests">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <span>{formatDay(c.work_date)} · {c.days === 1 ? "1 day" : "½ day"}{c.leave_type_name ? ` → ${c.leave_type_name}` : ""}</span>
              <Badge tone={TONE[c.status]}>{c.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Staff > Leave: pending comp-off requests, credited to a leave type on approval. */
export function CompOffApprovals({ leaveTypes }: { leaveTypes: { id: string; name: string; code: string }[] }) {
  const [rows, setRows] = useState<CompOff[] | null>(null);
  const [typeId, setTypeId] = useState("");
  const [rejecting, setRejecting] = useState<CompOff | null>(null);
  const load = useCallback(() => {
    api<CompOff[]>("/hrms/comp-off?status=pending", { notify: false }).then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);
  useEffect(() => { if (!typeId && leaveTypes.length) setTypeId((leaveTypes.find((t) => t.code === "casual") ?? leaveTypes[0]).id); }, [leaveTypes, typeId]);
  const approve = useAction((c: CompOff) => api(`/hrms/comp-off/${c.id}/approve`, { method: "POST", body: JSON.stringify({ leave_type_id: typeId }) }),
                            { success: "Comp-off added to their balance", failure: "Couldn't approve it" });
  if (!rows?.length) return null;
  return (
    <section aria-labelledby="comp-off-h" className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="comp-off-h" className="font-display text-lg font-semibold">Comp-off waiting</h2>
        <div className="w-48">
          <Field label="Add approved days to">
            <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        </div>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label="Comp-off requests">
        {rows.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <span><span className="font-medium">{c.employee_name}</span>
              <span className="block text-xs text-fg-muted">worked {formatDay(c.work_date)} · wants {c.days === 1 ? "1 day" : "½ day"}{c.reason ? ` · ${c.reason}` : ""}</span></span>
            <Can perm="hrms.leave.approve">
              <span className="flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setRejecting(c)}>Reject</Button>
                <Button size="sm" disabled={approve.busy || !typeId} onClick={async () => { if ((await approve.run(c)) !== undefined) load(); }}
                        aria-label={`Approve comp-off for ${c.employee_name}`}>Approve</Button>
              </span>
            </Can>
          </li>
        ))}
      </ul>
      {rejecting && <RejectDialog c={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); load(); }} />}
    </section>
  );
}

function RejectDialog({ c, onClose, onDone }: { c: CompOff; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const reject = useAction(() => api(`/hrms/comp-off/${c.id}/reject`, { method: "POST", body: JSON.stringify({ note }) }),
                           { success: "Rejected", failure: "Couldn't reject it" });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={`Reject comp-off for ${c.employee_name}`}>
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if ((await reject.run()) !== undefined) onDone(); }}>
        <Field label="Why"><Input value={note} required maxLength={500} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Back</Button>
          <Button type="submit" disabled={reject.busy || !note.trim()}>Reject</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** The profile's leave card: turn leave left into pay (HR with payroll rights). */
export function EncashButton({ employeeId, balances, onDone }: { employeeId: string; balances: Balance[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Can perm="hrms.leave.adjust">
      <Can perm="payroll.salary.update">
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Encash leave</Button>
        {open && <EncashDialog employeeId={employeeId} balances={balances} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onDone(); }} />}
      </Can>
    </Can>
  );
}

function EncashDialog({ employeeId, balances, onClose, onDone }: { employeeId: string; balances: Balance[]; onClose: () => void; onDone: () => void }) {
  const usable = balances.filter((b) => b.leave_type_id && b.remaining > 0);
  const [typeId, setTypeId] = useState(usable.find((b) => b.leave_type === "annual")?.leave_type_id ?? usable[0]?.leave_type_id ?? "");
  const [days, setDays] = useState("1");
  const [note, setNote] = useState("");
  const left = usable.find((b) => b.leave_type_id === typeId)?.remaining ?? 0;
  const go = useAction(
    () => api<Schema<"EncashOut">>(`/hrms/employees/${employeeId}/leave-encashments`, { method: "POST", body: JSON.stringify({ leave_type_id: typeId, days: Number(days), note }) }),
    { failure: "Couldn't encash it" },
  );
  const [done, setDone] = useState<Schema<"EncashOut"> | null>(null);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) { if (done) onDone(); else onClose(); } }} title="Encash leave">
      {done ? (
        <div className="space-y-3 text-sm">
          <p role="status">{done.days} day(s) encashed: {money(done.amount_minor ?? 0)} ({money(done.per_day_minor ?? 0)} a day), paid with the next salary.</p>
          <div className="flex justify-end"><Button onClick={onDone}>Done</Button></div>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const r = await go.run(); if (r) setDone(r); }}>
          <Field label="Leave">
            <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {usable.map((b) => <option key={b.leave_type_id!} value={b.leave_type_id!}>{b.name} ({b.remaining} left)</option>)}
            </Select>
          </Field>
          <Field label="Days"><Input type="number" min={0.5} step={0.5} max={left} required value={days} onChange={(e) => setDays(e.target.value)} /></Field>
          <Field label="Note"><Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></Field>
          <p className="text-xs text-fg-muted">Paid at a 30th of the monthly salary per day, taxed like salary.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={go.busy || !typeId || !(Number(days) > 0) || Number(days) > left}>Encash</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
