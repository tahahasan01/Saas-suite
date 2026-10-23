"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import {
  ACTIVITY_ICONS, type ActivityIcon, type ActivityType, type LostReason, type Pipeline, type Stage,
} from "@business-os/types";
import { api } from "@/lib/api";
import { useCan } from "@/lib/can";
import { errorText, useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { useConfirm } from "@/components/Confirm";
import { Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Select, Textarea } from "@/components/ui";
import { SellingSettings } from "@/components/crm/SellingSettings";

/** Settings → CRM (St02 §6.11 #7): pipelines and stages, lost reasons and
 *  activity types. Admin only (`crm.pipeline.manage`). */
export default function CrmSettingsPage() {
  const can = useCan();
  if (!can("crm.pipeline.manage")) {
    return <EmptyState title="Only admins can change the pipeline" hint="Ask the owner or an admin to change stages, lost reasons or activity types." />;
  }
  return (
    <div className="space-y-6">
      <PipelinesEditor />
      <div className="grid gap-6 lg:grid-cols-2">
        <LostReasonsEditor />
        <ActivityTypesEditor />
      </div>
      {can("crm.settings.manage") && <SellingSettings />}
    </div>
  );
}

// ── Pipelines and stages ────────────────────────────────────────────────────
function PipelinesEditor() {
  const [pipelines, setPipelines] = useState<Pipeline[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<{ kind: "stage" | "pipeline"; id: string; name: string } | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<Pipeline[]>("/crm/pipelines")
      .then((ps) => {
        setPipelines(ps);
        setSelected((cur) => (ps.some((p) => p.id === cur) ? cur : (ps.find((p) => p.is_default) ?? ps[0])?.id ?? ""));
      })
      .catch((e) => setError(errorText(e, "Couldn't load your pipelines.")));
  }, []);
  useEffect(load, [load]);

  const write = useAction((path: string, method: string, body?: unknown) =>
    api(path, { method, body: body === undefined ? undefined : JSON.stringify(body) }), { failure: "Couldn't save" });
  async function run(path: string, method: string, body?: unknown) {
    if ((await write.run(path, method, body)) !== undefined) load();
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!pipelines) return <LoadingRows label="Loading pipelines" />;
  const p = pipelines.find((x) => x.id === selected);

  function move(stages: Stage[], i: number, by: number) {
    const ids = stages.map((s) => s.id);
    const j = i + by;
    if (!p || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(`/crm/pipelines/${p.id}/stages/order`, "PUT", { stage_ids: ids });
  }

  return (
    <Card>
      <h2 className="mb-1 font-display text-base font-semibold">Pipelines and stages</h2>
      <p className="mb-4 text-xs text-fg-muted">
        Stages are the columns on your board. A won stage closes the deal; lost is a button on the lead, not a column.
      </p>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="w-56">
          <Field label="Pipeline">
            <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
              {pipelines.map((x) => <option key={x.id} value={x.id}>{x.name}{x.is_default ? " (default)" : ""}</option>)}
            </Select>
          </Field>
        </div>
        {p && !p.is_default && (
          <Button variant="subtle" size="sm" onClick={() => run(`/crm/pipelines/${p.id}`, "PATCH", { is_default: true })}>Make default</Button>
        )}
        {p && pipelines.length > 1 && (
          <Button variant="ghost" size="sm" onClick={() => setDeleting({ kind: "pipeline", id: p.id, name: p.name })}>Delete pipeline</Button>
        )}
        <form
          className="ms-auto flex items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            if ((await write.run("/crm/pipelines", "POST", { name: newName.trim() })) !== undefined) { setNewName(""); load(); }
          }}
        >
          <div className="w-44"><Field label="New pipeline"><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Admissions" /></Field></div>
          <Button type="submit" size="sm" disabled={write.busy || !newName.trim()}>Add</Button>
        </form>
      </div>

      {p && (
        <>
          <RenameRow label="Pipeline name" value={p.name} onSave={(name) => run(`/crm/pipelines/${p.id}`, "PATCH", { name })} />
          <ul className="mt-4 space-y-2" aria-label={`Stages of ${p.name}`}>
            {p.stages.map((s, i) => (
              <li key={s.id} className="rounded-lg border border-line p-3">
                <StageRow
                  stage={s}
                  onPatch={(patch) => run(`/crm/pipelines/${p.id}/stages/${s.id}`, "PATCH", patch)}
                  actions={
                    <span className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => move(p.stages, i, -1)}><ArrowUp size={14} aria-hidden /></Button>
                      <Button size="sm" variant="ghost" aria-label={`Move ${s.name} down`} disabled={i === p.stages.length - 1} onClick={() => move(p.stages, i, 1)}><ArrowDown size={14} aria-hidden /></Button>
                      <Button size="sm" variant="ghost" aria-label={`Delete ${s.name}`} onClick={() => setDeleting({ kind: "stage", id: s.id, name: s.name })}><Trash2 size={14} aria-hidden /></Button>
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
          <AddStage onAdd={(body) => run(`/crm/pipelines/${p.id}/stages`, "POST", body)} />
        </>
      )}

      {deleting && p && (
        <DeleteWithMove
          what={deleting}
          options={deleting.kind === "stage"
            ? p.stages.filter((s) => s.id !== deleting.id).map((s) => ({ id: s.id, name: s.name }))
            : pipelines.filter((x) => x.id !== deleting.id).map((x) => ({ id: x.id, name: x.name }))}
          onClose={() => setDeleting(null)}
          onDone={() => { setDeleting(null); load(); }}
          path={deleting.kind === "stage" ? `/crm/pipelines/${p.id}/stages/${deleting.id}` : `/crm/pipelines/${deleting.id}`}
        />
      )}
    </Card>
  );
}

function RenameRow({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="w-full sm:w-72">
      <Field label={label}>
        <Input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() && v !== value && onSave(v.trim())} />
      </Field>
    </div>
  );
}

function StageRow({ stage: s, onPatch, actions }: {
  stage: Stage; onPatch: (p: Record<string, unknown>) => void; actions: React.ReactNode;
}) {
  const [f, setF] = useState({ name: s.name, prob: s.default_probability?.toString() ?? "", rot: s.rotting_days?.toString() ?? "", req: s.requirements });
  useEffect(() => setF({ name: s.name, prob: s.default_probability?.toString() ?? "", rot: s.rotting_days?.toString() ?? "", req: s.requirements }), [s]);
  const num = (v: string) => (v.trim() === "" ? null : Math.round(Number(v)));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-44">
          <Field label="Stage">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })}
                   onBlur={() => f.name.trim() && f.name !== s.name && onPatch({ name: f.name.trim() })} />
          </Field>
        </div>
        <div className="w-24">
          <Field label="Probability %">
            <Input type="number" min={0} max={100} value={f.prob} onChange={(e) => setF({ ...f, prob: e.target.value })}
                   onBlur={() => num(f.prob) !== s.default_probability && onPatch({ default_probability: num(f.prob) })} />
          </Field>
        </div>
        <div className="w-24">
          <Field label="Stale after (days)">
            <Input type="number" min={1} max={365} value={f.rot} onChange={(e) => setF({ ...f, rot: e.target.value })}
                   onBlur={() => num(f.rot) !== s.rotting_days && onPatch({ rotting_days: num(f.rot) })} />
          </Field>
        </div>
        <label className="flex items-center gap-1.5 pb-2 text-sm">
          <input type="checkbox" checked={s.is_won} onChange={(e) => onPatch({ is_won: e.target.checked })} /> Won stage
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-sm">
          <input type="checkbox" checked={s.fold} onChange={(e) => onPatch({ fold: e.target.checked })} /> Folded
        </label>
        <span className="ms-auto pb-1">{actions}</span>
      </div>
      <Field label="What must be done before leaving this stage">
        <Textarea rows={1} value={f.req} maxLength={500} onChange={(e) => setF({ ...f, req: e.target.value })}
                  onBlur={() => f.req !== s.requirements && onPatch({ requirements: f.req })} />
      </Field>
    </div>
  );
}

function AddStage({ onAdd }: { onAdd: (body: Record<string, unknown>) => void }) {
  const [name, setName] = useState("");
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onAdd({ name: name.trim() }); setName(""); } }}
    >
      <div className="w-full sm:w-56"><Field label="New stage"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Site visit" /></Field></div>
      <Button type="submit" size="sm" disabled={!name.trim()}>Add stage</Button>
    </form>
  );
}

function DeleteWithMove({ what, options, path, onClose, onDone }: {
  what: { kind: "stage" | "pipeline"; id: string; name: string };
  options: { id: string; name: string }[];
  path: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [target, setTarget] = useState(options[0]?.id ?? "");
  const del = useAction((moveTo: string) => api(`${path}?move_to=${encodeURIComponent(moveTo)}`, { method: "DELETE" }),
    { success: `${what.kind === "stage" ? "Stage" : "Pipeline"} deleted`, failure: "Couldn't delete it" });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Delete ${what.name}?`}
            description={`Any leads in it move to the ${what.kind} you pick. Nothing else changes.`} size="sm">
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if ((await del.run(target)) !== undefined) onDone(); }}>
        <Field label={`Move its leads to`}>
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger" disabled={del.busy || !target}>{del.busy ? "Deleting…" : "Delete"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Lost reasons ────────────────────────────────────────────────────────────
function LostReasonsEditor() {
  return (
    <ListEditor<LostReason>
      title="Lost reasons"
      hint="The choices when a deal is marked lost. Retiring one keeps it on old deals."
      path="/crm/lost-reasons"
      placeholder="e.g. Moved away"
      render={(r, save) => <RenameRow label="Reason" value={r.name} onSave={(name) => save({ name })} />}
    />
  );
}

// ── Activity types ──────────────────────────────────────────────────────────
function ActivityTypesEditor() {
  return (
    <ListEditor<ActivityType>
      title="Activity types"
      hint="What your team plans: calls, visits, quotes. Retired types stay on old activities."
      path="/activity-types"
      placeholder="e.g. Home visit"
      render={(t, save) => (
        <div className="flex flex-wrap items-end gap-2">
          <RenameRow label="Type" value={t.name} onSave={(name) => save({ name })} />
          <div className="w-28">
            <Field label="Icon">
              <Select value={t.icon} onChange={(e) => save({ icon: e.target.value as ActivityIcon })}>
                {ACTIVITY_ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
              </Select>
            </Field>
          </div>
          <div className="w-24">
            <Field label="Due in (days)">
              <Input type="number" min={0} max={365} defaultValue={t.default_days}
                     onBlur={(e) => Number(e.target.value) !== t.default_days && save({ default_days: Number(e.target.value) })} />
            </Field>
          </div>
        </div>
      )}
    />
  );
}

/** A small add / edit / retire list over one endpoint. */
function ListEditor<T extends { id: string; name: string }>({ title, hint, path, placeholder, render }: {
  title: string; hint: string; path: string; placeholder: string;
  render: (row: T, save: (patch: Record<string, unknown>) => void) => React.ReactNode;
}) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const confirm = useConfirm();
  const load = useCallback(() => {
    setError(null);
    api<T[]>(path).then(setRows).catch((e) => setError(errorText(e, `Couldn't load ${title.toLowerCase()}.`)));
  }, [path, title]);
  useEffect(load, [load]);
  const write = useAction((url: string, method: string, body?: unknown) =>
    api(url, { method, body: body === undefined ? undefined : JSON.stringify(body) }), { failure: "Couldn't save" });

  return (
    <Card>
      <h2 className="mb-1 font-display text-base font-semibold">{title}</h2>
      <p className="mb-4 text-xs text-fg-muted">{hint}</p>
      {error ? <ErrorState message={error} onRetry={load} /> : !rows ? <LoadingRows label={`Loading ${title.toLowerCase()}`} /> : (
        <ul className="space-y-2" aria-label={title}>
          {rows.map((r) => (
            <li key={r.id} className="flex items-end justify-between gap-2 border-b border-line pb-2">
              {render(r, async (patch) => { if ((await write.run(`${path}/${r.id}`, "PATCH", patch)) !== undefined) load(); })}
              <Button
                size="sm" variant="ghost" aria-label={`Retire ${r.name}`}
                onClick={async () => {
                  const ok = await confirm({ title: `Retire ${r.name}?`, description: "It leaves the list; past records keep it.", confirmLabel: "Retire", tone: "danger",
                                             run: () => api(`${path}/${r.id}`, { method: "DELETE" }) });
                  if (ok) load();
                }}
              >
                <Trash2 size={14} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if ((await write.run(path, "POST", { name: name.trim() })) !== undefined) { setName(""); load(); }
        }}
      >
        <div className="flex-1"><Field label={`Add to ${title.toLowerCase()}`}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} /></Field></div>
        <Button type="submit" size="sm" disabled={write.busy || !name.trim()}>Add</Button>
      </form>
    </Card>
  );
}
