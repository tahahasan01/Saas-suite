"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { formatDay } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { Tabs } from "@/components/Tabs";
import { BoardingDialog, EXIT_REASONS, OWNERS } from "@/components/hrms/Boarding";
import { Badge, Button, EmptyState, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";

type Boarding = Schema<"BoardingOut">;
type Task = Schema<"BoardingTaskOut">;
type Template = Schema<"BoardingTemplateOut">;

const TONE = { open: "brand", completed: "success", cancelled: "neutral" } as const;

/** Joining and leaving (wave C, H23/H24): each person's checklist, the
 *  templates behind them, and the exit interview for leavers. */
export default function BoardingPage() {
  const [tab, setTab] = useState("onboarding");
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {        // ?open=<id> from the profile card
    const q = new URLSearchParams(window.location.search);
    if (q.get("open")) setOpenId(q.get("open"));
    if (q.get("tab")) setTab(q.get("tab")!);
  }, []);
  return (
    <div className="space-y-4">
      <Tabs label="Show" value={tab} onChange={setTab}
            items={[{ id: "onboarding", label: "Joining" }, { id: "offboarding", label: "Leaving" }, { id: "templates", label: "Templates" }]}>
        <div className="pt-3">
          {tab === "templates" ? <Templates /> : <BoardingList kind={tab as Boarding["kind"]} onOpen={setOpenId} />}
        </div>
      </Tabs>
      {openId && <BoardingDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function BoardingList({ kind, onOpen }: { kind: Boarding["kind"]; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<Boarding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("open");
  const load = useCallback(() => {
    setError(null);
    const q = new URLSearchParams({ kind, ...(status ? { status } : {}) });
    api<Boarding[]>(`/hrms/boardings?${q}`).then(setRows).catch((e) => setError(errorText(e)));
  }, [kind, status]);
  useEffect(load, [load]);
  return (
    <div className="space-y-3">
      <div className="w-44">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="open">In progress</option><option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option><option value="">All</option>
        </Select>
      </div>
      {error ? <ErrorState message={error} onRetry={load} /> : rows === null ? <LoadingRows rows={3} /> : rows.length === 0 ? (
        <EmptyState title={kind === "onboarding" ? "Nobody joining right now" : "Nobody leaving right now"}
                    hint="Start one from the person's profile under Team." />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label={kind === "onboarding" ? "Joining" : "Leaving"}>
          {rows.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => onOpen(b.id)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-start hover:bg-elevated">
                <span className="min-w-0">
                  <span className="font-medium">{b.employee_name}</span>
                  <span className="block text-xs text-fg-muted">
                    {b.kind === "onboarding" ? `Joins ${formatDay(b.anchor_date)}` : `Last day ${formatDay(b.last_working_day!)} · ${EXIT_REASONS[b.reason!]}`}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-fg-muted">{b.done} of {b.total} done</span>
                  <Badge tone={TONE[b.status]}>{b.status}</Badge>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Templates() {
  const [rows, setRows] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Template[]>("/hrms/boarding-templates").then(setRows).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);
  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">Without a template, a starter list is used. Days count from the joining date or the last working day.</p>
      <Can perm="hrms.boarding.manage"><Button variant="subtle" onClick={() => setEditing("new")}>New template</Button></Can>
      {error ? <ErrorState message={error} onRetry={load} /> : rows === null ? <LoadingRows rows={2} /> : rows.length === 0 ? (
        <EmptyState title="No templates yet" hint="Make one per role, for example Sales staff joining." />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label="Templates">
          {rows.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span><span className="font-medium">{t.name}</span>
                <span className="block text-xs text-fg-muted">{t.kind === "onboarding" ? "Joining" : "Leaving"} · {t.tasks.length} tasks</span></span>
              <span className="flex items-center gap-2">
                {!t.active && <Badge>off</Badge>}
                <Can perm="hrms.boarding.manage"><Button size="sm" variant="ghost" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}>Edit</Button></Can>
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing && <TemplateDialog template={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

function TemplateDialog({ template, onClose, onSaved }: { template: Template | null; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState(template?.kind ?? "onboarding");
  const [name, setName] = useState(template?.name ?? "");
  const [active, setActive] = useState(template?.active ?? true);
  const [tasks, setTasks] = useState(template?.tasks.map(({ title, owner, offset_days }) => ({ title, owner, offset_days }))
                                     ?? [{ title: "", owner: "hr" as Task["owner"], offset_days: 0 }]);
  const save = useAction(
    () => {
      const body = { name, tasks: tasks.filter((t) => t.title.trim()) };
      return template
        ? api(`/hrms/boarding-templates/${template.id}`, { method: "PATCH", body: JSON.stringify({ ...body, active }) })
        : api("/hrms/boarding-templates", { method: "POST", body: JSON.stringify({ ...body, kind }) });
    },
    { success: "Template saved", failure: "Couldn't save it" },
  );
  const set = (i: number, patch: Partial<(typeof tasks)[number]>) => setTasks(tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={template ? `Edit ${template.name}` : "New template"} size="lg">
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if ((await save.run()) !== undefined) { onSaved(); onClose(); } }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input value={name} required maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Shop staff joining" /></Field>
          {template ? (
            <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> In use</label>
          ) : (
            <Field label="For">
              <Select value={kind} onChange={(e) => setKind(e.target.value as Template["kind"])}>
                <option value="onboarding">Joining</option><option value="offboarding">Leaving</option>
              </Select>
            </Field>
          )}
        </div>
        <ul className="space-y-2" aria-label="Template tasks">
          {tasks.map((t, i) => (
            <li key={i} className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1"><Field label={`Task ${i + 1}`}><Input value={t.title} maxLength={200} onChange={(e) => set(i, { title: e.target.value })} /></Field></div>
              <Field label="Who">
                <Select value={t.owner} onChange={(e) => set(i, { owner: e.target.value as Task["owner"] })}>
                  {Object.entries(OWNERS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
              <div className="w-24"><Field label="Day"><Input type="number" min={-365} max={365} value={t.offset_days} onChange={(e) => set(i, { offset_days: Number(e.target.value) })} /></Field></div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setTasks(tasks.filter((_, j) => j !== i))} aria-label={`Remove task ${i + 1}`}>Remove</Button>
            </li>
          ))}
        </ul>
        <Button type="button" size="sm" variant="subtle" onClick={() => setTasks([...tasks, { title: "", owner: "hr", offset_days: 0 }])}>Add a task</Button>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.busy || !name.trim()}>{save.busy ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
