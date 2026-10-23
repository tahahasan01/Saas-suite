"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { formatDay } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { Button, ErrorState, Field, Input, LoadingRows, Select, Textarea } from "@/components/ui";

type Boarding = Schema<"BoardingOut">;
type Task = Schema<"BoardingTaskOut">;

export const OWNERS: Record<string, string> = { hr: "HR", it: "IT", manager: "Manager", employee: "Employee", admin: "Admin" };
export const EXIT_REASONS: Record<string, string> = {
  resigned: "Resigned", terminated: "Terminated", retired: "Retired", contract_end: "Contract ended",
  absconded: "Stopped coming", deceased: "Passed away", other: "Other",
};
const LEAVING: Record<string, string> = {
  pay: "Pay", growth: "Growth", manager: "Manager", workload: "Workload", hours: "Hours", relocation: "Moving away",
  studies: "Studies", health: "Health", personal: "Personal", other: "Other",
};
/** One person's joining or leaving checklist (wave C, H23/H24): tick or
 *  skip tasks, see what they still hold, and (HR only) the exit interview. */
export function BoardingDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [b, setB] = useState<Boarding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState<Task | null>(null);
  // Ticks in flight, and which load is newest: a reload that started before
  // the next tick must not land after it and untick that box.
  const pending = useRef(0);
  const loadSeq = useRef(0);
  const load = useCallback(() => {
    setError(null);
    const seq = ++loadSeq.current;
    api<Boarding>(`/hrms/boardings/${id}`)
      .then((next) => { if (seq === loadSeq.current && pending.current === 0) setB(next); })
      .catch((e) => setError(errorText(e)));
  }, [id]);
  useEffect(load, [load]);

  const tick = useAction(
    (t: Task, status: string, note?: string) =>
      api(`/hrms/boarding-tasks/${t.id}`, { method: "PATCH", body: JSON.stringify({ status, ...(note !== undefined ? { note } : {}) }) }),
    { failure: "Couldn't update the task" },
  );
  const close = useAction(
    (what: "complete" | "cancel") => api(`/hrms/boardings/${id}/${what}`, { method: "POST", body: JSON.stringify({}) }),
    { failure: "Couldn't do that" },
  );
  // The box flips at once; the server's answer then replaces the whole list.
  async function toggle(t: Task, checked: boolean) {
    const status = checked ? "done" : "open";
    setB((cur) => cur && { ...cur, done: cur.done + (checked ? 1 : -1),
                           tasks: (cur.tasks ?? []).map((x) => (x.id === t.id ? { ...x, status } : x)) });
    pending.current += 1;
    try { await tick.run(t, status); } finally { pending.current -= 1; }
    if (pending.current === 0) load();     // the last tick's reload brings the server's truth
  }
  const title = b ? `${b.kind === "onboarding" ? "Joining" : "Leaving"}: ${b.employee_name}` : "Checklist";
  const open = b?.status === "open";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={title} size="lg">
      {error ? <ErrorState message={error} onRetry={load} /> : !b ? <LoadingRows rows={4} /> : (
        <div className="space-y-4 text-sm">
          <p className="text-fg-muted">
            {b.kind === "onboarding" ? `Joins ${formatDay(b.anchor_date)}` : <>
              {EXIT_REASONS[b.reason!]}{b.notice_date ? `, notice ${formatDay(b.notice_date)}` : ""} · last day {formatDay(b.last_working_day!)}
            </>} · {b.done} of {b.total} done · <Link href={`/hrms/employees/${b.employee_id}`} className="text-brand hover:underline">Profile</Link>
          </p>
          <ul className="divide-y divide-line rounded-lg border border-line" aria-label="Tasks">
            {(b.tasks ?? []).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <label className="flex min-w-0 items-start gap-2">
                  <input type="checkbox" className="mt-1 size-4 accent-[var(--color-brand)]" checked={t.status !== "open"}
                         disabled={!open || t.status === "skipped"} aria-label={t.title}
                         onChange={(e) => toggle(t, e.target.checked)} />
                  <span className="min-w-0">
                    <span className={t.status !== "open" ? "text-fg-muted line-through" : "font-medium"}>{t.title}</span>
                    <span className="block text-xs text-fg-muted">
                      {OWNERS[t.owner]}{t.due_on ? ` · due ${formatDay(t.due_on)}` : ""}{t.status === "skipped" ? ` · skipped: ${t.note}` : ""}
                    </span>
                  </span>
                </label>
                {open && t.status === "open" && (
                  <Can perm="hrms.boarding.manage">
                    <Button size="sm" variant="ghost" onClick={() => setSkipping(t)} aria-label={`Skip ${t.title}`}>Skip</Button>
                  </Can>
                )}
              </li>
            ))}
          </ul>
          {open && <Can perm="hrms.boarding.manage"><AddTask boardingId={b.id} onAdded={load} /></Can>}
          {b.kind === "offboarding" && (
            <section aria-labelledby="held-h" className="space-y-1">
              <h3 id="held-h" className="font-semibold">Assets still held</h3>
              {(b.assets_held ?? []).length === 0 ? <p className="text-fg-muted">All returned.</p> : (
                <ul aria-label="Assets still held" className="list-disc ps-5">
                  {(b.assets_held ?? []).map((a) => <li key={a.id}>{a.name}{a.tag ? ` (${a.tag})` : ""}</li>)}
                </ul>
              )}
              {(b.assets_held ?? []).length > 0 && <Link href="/hrms/assets" className="text-xs text-brand hover:underline">Take them back on Assets →</Link>}
            </section>
          )}
          {b.kind === "offboarding" && <Can perm="hrms.boarding.manage"><ExitInterview b={b} onSaved={load} /></Can>}
          {open && (
            <Can perm="hrms.boarding.manage">
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" disabled={close.busy}
                        onClick={async () => { if ((await close.run("cancel")) !== undefined) load(); }}>
                  {b.kind === "offboarding" ? "Cancel (they're staying)" : "Cancel"}
                </Button>
                <Button disabled={close.busy || b.done < b.total}
                        onClick={async () => { if ((await close.run("complete")) !== undefined) load(); }}>Mark complete</Button>
              </div>
            </Can>
          )}
        </div>
      )}
      {skipping && <SkipDialog task={skipping} onClose={() => setSkipping(null)}
                               onSkip={async (note) => { if ((await tick.run(skipping, "skipped", note)) !== undefined) { setSkipping(null); load(); } }} />}
    </Dialog>
  );
}

function SkipDialog({ task, onClose, onSkip }: { task: Task; onClose: () => void; onSkip: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={`Skip ${task.title}`}>
      <form onSubmit={(e) => { e.preventDefault(); onSkip(note); }} className="space-y-3">
        <Field label="Why"><Input value={note} required maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Not needed for this role" /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Back</Button>
          <Button type="submit" disabled={!note.trim()}>Skip task</Button>
        </div>
      </form>
    </Dialog>
  );
}

function AddTask({ boardingId, onAdded }: { boardingId: string; onAdded: () => void }) {
  const [f, setF] = useState({ title: "", owner: "hr", due_on: "" });
  const add = useAction(
    () => api(`/hrms/boardings/${boardingId}/tasks`, { method: "POST", body: JSON.stringify({ ...f, due_on: f.due_on || null }) }),
    { failure: "Couldn't add the task" },
  );
  return (
    <form aria-label="Add a task" className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => { e.preventDefault(); if ((await add.run()) !== undefined) { setF({ title: "", owner: "hr", due_on: "" }); onAdded(); } }}>
      <div className="min-w-48 flex-1"><Field label="New task"><Input value={f.title} required maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field></div>
      <Field label="Who">
        <Select value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}>
          {Object.entries(OWNERS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Due"><Input type="date" value={f.due_on} onChange={(e) => setF({ ...f, due_on: e.target.value })} /></Field>
      <Button type="submit" variant="subtle" disabled={add.busy || !f.title.trim()}>Add</Button>
    </form>
  );
}

function ExitInterview({ b, onSaved }: { b: Boarding; onSaved: () => void }) {
  const iv = b.exit_interview;
  const [f, setF] = useState({
    held_on: iv?.held_on ?? "", outcome: iv?.outcome ?? "", rating: iv?.rating ? String(iv.rating) : "",
    primary_reason: iv?.primary_reason ?? "", would_rejoin: iv?.would_rejoin == null ? "" : iv.would_rejoin ? "yes" : "no",
    notes: iv?.notes ?? "",
  });
  const save = useAction(
    () => api(`/hrms/boardings/${b.id}/exit-interview`, { method: "PUT", body: JSON.stringify({
      held_on: f.held_on || null, outcome: f.outcome || null, rating: f.rating ? Number(f.rating) : null,
      primary_reason: f.primary_reason || null, would_rejoin: f.would_rejoin ? f.would_rejoin === "yes" : null, notes: f.notes,
    }) }),
    { success: "Exit interview saved", failure: "Couldn't save it" },
  );
  return (
    <section aria-labelledby="exit-h" className="space-y-2">
      <h3 id="exit-h" className="font-semibold">Exit interview <span className="text-xs font-normal text-fg-muted">(only HR sees this)</span></h3>
      <form aria-label="Exit interview" className="grid gap-3 sm:grid-cols-3"
            onSubmit={async (e) => { e.preventDefault(); if ((await save.run()) !== undefined) onSaved(); }}>
        <Field label="Held on"><Input type="date" value={f.held_on} onChange={(e) => setF({ ...f, held_on: e.target.value })} /></Field>
        <Field label="Outcome">
          <Select value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}>
            <option value="">—</option><option value="leaving">Leaving</option><option value="retained">Staying after all</option>
          </Select>
        </Field>
        <Field label="Main reason">
          <Select value={f.primary_reason} onChange={(e) => setF({ ...f, primary_reason: e.target.value })}>
            <option value="">—</option>
            {Object.entries(LEAVING).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Rating of the job (1–5)">
          <Select value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })}>
            <option value="">—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
        <Field label="Would rejoin">
          <Select value={f.would_rejoin} onChange={(e) => setF({ ...f, would_rejoin: e.target.value })}>
            <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
          </Select>
        </Field>
        <div className="sm:col-span-3"><Field label="Notes"><Textarea rows={3} maxLength={4000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field></div>
        <div className="flex justify-end sm:col-span-3"><Button type="submit" variant="subtle" disabled={save.busy}>{save.busy ? "Saving…" : "Save interview"}</Button></div>
      </form>
    </section>
  );
}

