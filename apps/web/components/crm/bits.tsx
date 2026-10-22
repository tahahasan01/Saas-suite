"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Banknote, CheckSquare, FileText, MapPin, MessageCircle, Phone, Star, Users, type LucideIcon,
} from "lucide-react";
import type { Activity, ActivityIcon, ActivityType, LostReason } from "@business-os/types";
import { api } from "@/lib/api";
import { dayPKT } from "@/lib/dates";
import { formatDay } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { Badge, Button, EmptyState, ErrorState, Field, Input, LoadingRows, Select, Textarea } from "@/components/ui";
import { announceActivitiesChanged } from "./ActivityBadge";

export const ACTIVITY_ICON: Record<ActivityIcon, LucideIcon> = {
  call: Phone, whatsapp: MessageCircle, meeting: Users, visit: MapPin,
  todo: CheckSquare, quote: FileText, payment: Banknote,
};

export function TypeIcon({ icon, size = 14 }: { icon: ActivityIcon; size?: number }) {
  const I = ACTIVITY_ICON[icon] ?? CheckSquare;
  return <I size={size} aria-hidden className="shrink-0" />;
}

const DOT = { overdue: "bg-danger", today: "bg-warning", planned: "bg-success" } as const;
const DOT_LABEL = { overdue: "Overdue activity", today: "Activity due today", planned: "Activity planned" } as const;

/** Red overdue, amber today, green planned (St02 §6.11). */
export function ActivityDot({ state }: { state: "overdue" | "today" | "planned" | null }) {
  if (!state) return null;
  return (
    <span className="inline-flex items-center" title={DOT_LABEL[state]}>
      <span className={`h-2 w-2 rounded-full ${DOT[state]}`} aria-hidden />
      <span className="sr-only">{DOT_LABEL[state]}</span>
    </span>
  );
}

export function Stars({ value }: { value: number }) {
  if (!value) return null;
  return (
    <span className="inline-flex text-saffron" title={`Priority ${value} of 3`}>
      {Array.from({ length: value }, (_, i) => <Star key={i} size={11} fill="currentColor" aria-hidden />)}
      <span className="sr-only">Priority {value} of 3</span>
    </span>
  );
}

/** 0–3 as a radio group: a star per level, and "none". */
export function PriorityPicker({ value, onChange, disabled }: {
  value: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Priority" className="flex items-center gap-0.5">
      {[1, 2, 3].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          disabled={disabled}
          onClick={() => onChange(value === n ? 0 : n)}
          className="grid h-8 w-8 place-items-center rounded-md text-saffron hover:bg-elevated pointer-coarse:h-11 pointer-coarse:w-11"
        >
          <Star size={16} fill={n <= value ? "currentColor" : "none"} aria-hidden />
        </button>
      ))}
    </div>
  );
}

export function useActivityTypes() {
  const [types, setTypes] = useState<ActivityType[]>([]);
  useEffect(() => {
    api<ActivityType[]>("/activity-types").then(setTypes).catch(() => setTypes([]));
  }, []);
  return types;
}

export function useLostReasons(open: boolean) {
  const [reasons, setReasons] = useState<LostReason[] | null>(null);
  useEffect(() => {
    if (open) api<LostReason[]>("/crm/lost-reasons").then(setReasons).catch(() => setReasons([]));
  }, [open]);
  return reasons;
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Lost needs a why (optional by default) and a note: they feed the
 *  lost-reasons report. */
export function LostDialog({ leadId, name, open, onClose, onDone }: {
  leadId: string; name: string; open: boolean; onClose: () => void; onDone: () => void;
}) {
  const reasons = useLostReasons(open);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const save = useAction(
    () => api(`/crm/leads/${leadId}/lost`, {
      method: "POST", body: JSON.stringify({ lost_reason_id: reason || null, lost_note: note || null }),
    }),
    { success: "Marked as lost", failure: "Couldn't mark it lost" },
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((await save.run()) !== undefined) { setReason(""); setNote(""); onDone(); }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Mark ${name} as lost`}
      description="It leaves the board but stays in your reports. You can restore it later."
      size="sm"
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Reason">
          <Select value={reason} onChange={(e) => setReason(e.target.value)} disabled={!reasons}>
            <option value="">No reason given</option>
            {reasons?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label="Note">
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger" disabled={save.busy}>{save.busy ? "Saving…" : "Mark lost"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Plan the next thing to do on a record. */
export function ScheduleActivity({ entityId, entityType = "lead", onSaved, compact }: {
  entityId: string; entityType?: Activity["entity_type"]; onSaved: () => void; compact?: boolean;
}) {
  const types = useActivityTypes();
  const [f, setF] = useState({ type_id: "", summary: "", due_date: dayPKT() });
  const typeId = f.type_id || types[0]?.id || "";
  const save = useAction(
    () => api<Activity>("/activities", {
      method: "POST",
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, type_id: typeId,
                             summary: f.summary, due_date: f.due_date }),
    }),
    { success: "Activity scheduled", failure: "Couldn't schedule it" },
  );
  const pickType = useCallback((id: string) => {
    const t = types.find((x) => x.id === id);
    setF((cur) => ({ ...cur, type_id: id, due_date: t ? addDays(dayPKT(), t.default_days) : cur.due_date }));
  }, [types]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!typeId) return;
    if ((await save.run()) !== undefined) {
      setF({ type_id: "", summary: "", due_date: dayPKT() });
      announceActivitiesChanged();
      onSaved();
    }
  }
  return (
    <form onSubmit={submit} className={`grid gap-2 ${compact ? "" : "sm:grid-cols-[8rem_minmax(0,1fr)_9rem_auto]"} items-end`}>
      <Field label="Type">
        <Select value={typeId} onChange={(e) => pickType(e.target.value)}>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </Field>
      <Field label="What to do">
        <Input value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} placeholder="e.g. Call about the quote" maxLength={200} />
      </Field>
      <Field label="Due">
        <Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} required />
      </Field>
      <Button type="submit" disabled={save.busy || !typeId}>{save.busy ? "Saving…" : "Schedule"}</Button>
    </form>
  );
}

/** Done / snooze buttons for one activity; used by the drawer and My Day. */
export function ActivityActions({ activity: a, onChanged, label }: {
  activity: Activity; onChanged: () => void; label?: string;
}) {
  const what = label ?? a.summary;
  const done = useAction(
    () => api(`/activities/${a.id}/done`, { method: "POST", body: JSON.stringify({}) }),
    { success: "Marked done", failure: "Couldn't mark it done" },
  );
  const snooze = useAction(
    (days: number) => api(`/activities/${a.id}/snooze`, { method: "POST", body: JSON.stringify({ days }) }),
    { success: "Snoozed", failure: "Couldn't snooze it" },
  );
  async function run(p: Promise<unknown>) {
    if ((await p) !== undefined) { announceActivitiesChanged(); onChanged(); }
  }
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1">
      <Button size="sm" variant="subtle" disabled={done.busy} onClick={() => run(done.run())} aria-label={`Done: ${what}`}>
        Done
      </Button>
      <Select
        value=""
        aria-label={`Snooze ${what}`}
        className="w-28 py-1 text-xs"
        disabled={snooze.busy}
        onChange={(e) => e.target.value && run(snooze.run(Number(e.target.value)))}
      >
        <option value="">Snooze…</option>
        <option value="1">1 day</option>
        <option value="3">3 days</option>
        <option value="7">1 week</option>
      </Select>
    </span>
  );
}


export const ACTIVITY_STATE_TONE = {
  overdue: "danger", today: "warning", planned: "neutral", done: "success", cancelled: "neutral",
} as const;

/** A record's open activities with Done/Snooze and a schedule form; Contact 360 uses it. */
export function RecordActivities({ entityType, entityId, canPlan }: {
  entityType: Activity["entity_type"]; entityId: string; canPlan: boolean;
}) {
  const [items, setItems] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Activity[]>(`/activities?entity_type=${entityType}&entity_id=${entityId}`)
      .then(setItems)
      .catch((e) => setError(errorText(e)));
  }, [entityType, entityId]);
  useEffect(load, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (items === null) return <LoadingRows label="Loading activities" />;
  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <EmptyState title="Nothing planned" hint="Schedule the next call or visit so it shows up in My day." />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <TypeIcon icon={a.type_icon} />
                <span className="min-w-0">
                  <span className="block truncate" title={a.summary}>{a.summary || a.type_name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
                    <Badge tone={ACTIVITY_STATE_TONE[a.state]}>{a.state === "planned" ? formatDay(a.due_date) : a.state}</Badge>
                    {a.assigned_name && <span>{a.assigned_name}</span>}
                  </span>
                </span>
              </span>
              {canPlan && <ActivityActions activity={a} onChanged={load} label={a.summary || a.type_name} />}
            </li>
          ))}
        </ul>
      )}
      {canPlan && <ScheduleActivity entityType={entityType} entityId={entityId} onSaved={load} />}
    </div>
  );
}
