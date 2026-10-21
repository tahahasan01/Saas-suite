"use client";

import { useState } from "react";
import type { Leave, LeaveType } from "@business-os/types";
import { Button, Field, Input, Select } from "@/components/ui";

/* One leave form for the employee's own requests (/me/leave) and HR filing on
   someone's behalf (/hrms/leave). Types come from the tenant's own list;
   half days follow the server's rule: one day can be a morning or an
   afternoon, a longer leave can start after lunch and end at lunchtime. */

export type LeaveDraft = {
  leave_type: string;
  from_date: string;
  to_date: string;
  from_half: "am" | "pm" | null;
  to_half: "am" | "pm" | null;
  reason: string;
};

const blank: LeaveDraft = { leave_type: "", from_date: "", to_date: "", from_half: null, to_half: null, reason: "" };

export function LeaveRequestForm({ types, busy, onSubmit, children, submitLabel = "Submit" }: {
  types: LeaveType[];
  busy: boolean;
  /** Resolve true when saved, so the form clears; anything else keeps what was typed. */
  onSubmit: (draft: LeaveDraft) => Promise<boolean>;
  children?: React.ReactNode;
  submitLabel?: string;
}) {
  const active = types.filter((t) => t.active);
  const [f, setF] = useState<LeaveDraft>(blank);
  const type = active.find((t) => t.code === (f.leave_type || active[0]?.code));
  const oneDay = !!f.from_date && (!f.to_date || f.to_date === f.from_date);
  const single = oneDay ? (f.from_half ?? "full") : "full";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const draft = { ...f, leave_type: f.leave_type || active[0]?.code || "", to_date: f.to_date || f.from_date };
    if (await onSubmit(draft)) setF(blank);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {children}
      <Field label="Type">
        <Select value={type?.code ?? ""} onChange={(e) => setF({ ...f, leave_type: e.target.value, from_half: null, to_half: null })}>
          {active.map((t) => <option key={t.id} value={t.code}>{t.name}{t.paid ? "" : " (unpaid)"}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From"><Input type="date" value={f.from_date} required onChange={(e) => setF({ ...f, from_date: e.target.value, from_half: null, to_half: null })} /></Field>
        <Field label="To"><Input type="date" value={f.to_date} min={f.from_date || undefined} onChange={(e) => setF({ ...f, to_date: e.target.value, from_half: null, to_half: null })} /></Field>
      </div>
      {type?.allow_half_day && f.from_date && (oneDay ? (
        <Field label="Day">
          <Select value={single} onChange={(e) => {
            const v = e.target.value === "full" ? null : (e.target.value as "am" | "pm");
            setF({ ...f, from_half: v, to_half: v });
          }}>
            <option value="full">Full day</option>
            <option value="am">Morning only (half day)</option>
            <option value="pm">Afternoon only (half day)</option>
          </Select>
        </Field>
      ) : (
        <div className="space-y-1.5 text-sm">
          <label className="flex items-center gap-2 pointer-coarse:min-h-11">
            <input type="checkbox" checked={f.from_half === "pm"} onChange={(e) => setF({ ...f, from_half: e.target.checked ? "pm" : null })} />
            Start after lunch on the first day
          </label>
          <label className="flex items-center gap-2 pointer-coarse:min-h-11">
            <input type="checkbox" checked={f.to_half === "am"} onChange={(e) => setF({ ...f, to_half: e.target.checked ? "am" : null })} />
            Back after lunch on the last day
          </label>
        </div>
      ))}
      <Field label="Reason"><Input value={f.reason} maxLength={1000} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      <Button type="submit" disabled={busy || !active.length} className="w-full">{busy ? "Submitting…" : submitLabel}</Button>
    </form>
  );
}

/** "2 days", "½ day", "1½ days". */
export function daysLabel(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  const whole = Math.floor(n);
  const half = n - whole >= 0.5;
  const txt = whole === 0 ? (half ? "½" : "0") : `${whole}${half ? "½" : ""}`;
  return `${txt} day${n > 1 ? "s" : ""}`;
}

/** "(morning)", "(from the afternoon)" etc. for a request's halves. */
export function halvesLabel(l: Pick<Leave, "from_date" | "to_date" | "from_half" | "to_half">): string {
  if (l.from_date === l.to_date) {
    return l.from_half === "am" ? "morning" : l.from_half === "pm" ? "afternoon" : "";
  }
  return [l.from_half === "pm" ? "from the afternoon" : "", l.to_half === "am" ? "until lunch" : ""].filter(Boolean).join(", ");
}

export const leaveTone = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" } as const;

export function stepLabel(l: Pick<Leave, "status" | "approval_step">): string {
  if (l.status !== "pending") return l.status;
  return l.approval_step === "manager" ? "waiting for manager" : "waiting for HR";
}
