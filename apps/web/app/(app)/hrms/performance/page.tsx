"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { formatDay } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { Tabs } from "@/components/Tabs";
import { APPRAISAL_STATUS, AppraisalForm } from "@/components/hrms/AppraisalForm";
import { Badge, Button, EmptyState, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";

type Due = Schema<"ProbationDue">;
type Cycle = Schema<"AppraisalCycleOut">;
type Appraisal = Schema<"AppraisalOut">;
type Template = Schema<"AppraisalTemplateOut">;

const CYCLE_TONE = { draft: "neutral", open: "brand", closed: "success" } as const;

/** Performance (wave C, H25/H26): probation coming due, appraisal cycles
 *  and their KRA templates. */
export default function PerformancePage() {
  const [tab, setTab] = useState("probation");
  return (
    <Tabs label="Show" value={tab} onChange={setTab}
          items={[{ id: "probation", label: "Probation" }, { id: "cycles", label: "Appraisals" }, { id: "templates", label: "KRA templates" }]}>
      <div className="pt-3">{tab === "probation" ? <Probation /> : tab === "cycles" ? <Cycles /> : <Templates />}</div>
    </Tabs>
  );
}

// ── Probation ───────────────────────────────────────────────────────────────
function Probation() {
  const [rows, setRows] = useState<Due[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<Due | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Due[]>("/hrms/probation?within_days=60").then(setRows).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (rows === null) return <LoadingRows rows={3} />;
  if (rows.length === 0) return <EmptyState title="No probation ending in the next 60 days" hint="Set a probation end date on someone's profile under Job." />;
  return (
    <>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label="Probation ending">
        {rows.map((d) => (
          <li key={d.employee_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <span className="min-w-0">
              <Link href={`/hrms/employees/${d.employee_id}`} className="font-medium hover:underline">{d.name}</Link>
              <span className="block text-xs text-fg-muted">
                {[d.designation, d.manager_name && `reports to ${d.manager_name}`].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <Badge tone={d.days_left < 0 ? "danger" : d.days_left <= 14 ? "warning" : "neutral"}>
                {d.days_left < 0 ? `ended ${-d.days_left} days ago` : `ends ${formatDay(d.probation_end)}`}
              </Badge>
              <Can perm="hrms.employee.update">
                <Button size="sm" variant="subtle" onClick={() => setDeciding(d)} aria-label={`Decide probation for ${d.name}`}>Decide</Button>
              </Can>
            </span>
          </li>
        ))}
      </ul>
      {deciding && <ProbationDialog due={deciding} onClose={() => setDeciding(null)} onDone={load} />}
    </>
  );
}

function ProbationDialog({ due, onClose, onDone }: { due: Due; onClose: () => void; onDone: () => void }) {
  const [outcome, setOutcome] = useState("confirmed");
  const [newEnd, setNewEnd] = useState("");
  const [note, setNote] = useState("");
  const decide = useAction(
    () => api(`/hrms/employees/${due.employee_id}/probation-review`, { method: "POST", body: JSON.stringify({
      outcome, note, new_end: outcome === "extended" ? newEnd : null,
    }) }),
    { success: "Probation decided", failure: "Couldn't save the decision" },
  );
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={`Probation: ${due.name}`}>
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if ((await decide.run()) !== undefined) { onDone(); onClose(); } }}>
        <Field label="Decision">
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="confirmed">Confirm</option><option value="extended">Extend</option><option value="ended">End employment</option>
          </Select>
        </Field>
        {outcome === "extended" && (
          <Field label="New end date"><Input type="date" required min={due.probation_end} value={newEnd} onChange={(e) => setNewEnd(e.target.value)} /></Field>
        )}
        {outcome === "ended" && <p className="text-sm text-fg-muted">Then record their leaving on the profile, so payroll stops on the last day.</p>}
        <Field label="Note"><Input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={decide.busy || (outcome === "extended" && !newEnd)}>Save decision</Button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Cycles ──────────────────────────────────────────────────────────────────
function Cycles() {
  const [rows, setRows] = useState<Cycle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Cycle[]>("/hrms/appraisal-cycles").then(setRows).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);
  return (
    <div className="space-y-3">
      <Can perm="hrms.appraisal.manage"><Button variant="subtle" onClick={() => setCreating(true)}>New appraisal cycle</Button></Can>
      {error ? <ErrorState message={error} onRetry={load} /> : rows === null ? <LoadingRows rows={2} /> : rows.length === 0 ? (
        <EmptyState title="No appraisal cycles yet" hint="Make a KRA template first, then a cycle for the year or half-year." />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label="Appraisal cycles">
          {rows.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setOpenId(c.id)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-start hover:bg-elevated">
                <span><span className="font-medium">{c.name}</span>
                  <span className="block text-xs text-fg-muted">{formatDay(c.period_start)} – {formatDay(c.period_end)} · {c.template_name}</span></span>
                <span className="flex items-center gap-2">
                  {c.status === "open" && <span className="text-xs text-fg-muted">{c.counts?.done ?? 0} done</span>}
                  <Badge tone={CYCLE_TONE[c.status]}>{c.status}</Badge>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {creating && <NewCycle onClose={() => setCreating(false)} onCreated={(id) => { load(); setOpenId(id); }} />}
      {openId && <CycleDialog id={openId} onClose={() => { setOpenId(null); load(); }} />}
    </div>
  );
}

function NewCycle({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const year = new Date().getFullYear();
  const [f, setF] = useState({ name: `${year} review`, period_start: `${year}-01-01`, period_end: `${year}-12-31`, template_id: "", self_review: true });
  useEffect(() => {
    api<Template[]>("/hrms/appraisal-templates", { notify: false }).then((t) => {
      const on = t.filter((x) => x.active);
      setTemplates(on);
      setF((cur) => ({ ...cur, template_id: cur.template_id || on[0]?.id || "" }));
    }).catch(() => setTemplates([]));
  }, []);
  const create = useAction(() => api<Cycle>("/hrms/appraisal-cycles", { method: "POST", body: JSON.stringify(f) }),
                           { success: "Cycle created", failure: "Couldn't create it" });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title="New appraisal cycle">
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const c = await create.run(); if (c) { onClose(); onCreated(c.id); } }}>
        <Field label="Name"><Input value={f.name} required maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From"><Input type="date" required value={f.period_start} onChange={(e) => setF({ ...f, period_start: e.target.value })} /></Field>
          <Field label="To"><Input type="date" required value={f.period_end} min={f.period_start} onChange={(e) => setF({ ...f, period_end: e.target.value })} /></Field>
        </div>
        <Field label="KRA template">
          <Select value={f.template_id} required onChange={(e) => setF({ ...f, template_id: e.target.value })}>
            {templates.length === 0 && <option value="">Make a template first</option>}
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.self_review} onChange={(e) => setF({ ...f, self_review: e.target.checked })} /> Staff rate themselves first
        </label>
        <p className="text-xs text-fg-muted">Everyone on staff is included. Each person is reviewed by their manager.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={create.busy || !f.template_id}>Create</Button>
        </div>
      </form>
    </Dialog>
  );
}

function CycleDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [c, setC] = useState<Cycle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Cycle>(`/hrms/appraisal-cycles/${id}`).then(setC).catch((e) => setError(errorText(e)));
  }, [id]);
  useEffect(load, [load]);
  const step = useAction((what: "open" | "close") => api(`/hrms/appraisal-cycles/${id}/${what}`, { method: "POST" }),
                         { failure: "Couldn't do that" });
  const cancel = useAction((a: Appraisal) => api(`/hrms/appraisals/${a.id}/cancel`, { method: "POST" }), { failure: "Couldn't cancel it" });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={c ? c.name : "Appraisal cycle"} size="lg">
      {error ? <ErrorState message={error} onRetry={load} /> : !c ? <LoadingRows rows={3} /> : (
        <div className="space-y-3 text-sm">
          <p className="text-fg-muted">{formatDay(c.period_start)} – {formatDay(c.period_end)} · {c.template_name} · {c.status}</p>
          {c.status === "draft" ? <p>Opening it starts an appraisal for each person on staff.</p> : (
            <ul className="divide-y divide-line rounded-lg border border-line" aria-label="Appraisals">
              {(c.appraisals ?? []).map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span><span className="font-medium">{a.employee_name}</span>
                    <span className="block text-xs text-fg-muted">{a.reviewer_name ? `Reviewer: ${a.reviewer_name}` : "No manager: HR reviews"}</span></span>
                  <span className="flex items-center gap-2">
                    {a.score != null && <span className="font-medium tabular-nums">{a.score.toFixed(2)} / 5</span>}
                    <Badge tone={a.status === "done" ? "success" : a.status === "cancelled" ? "neutral" : "brand"}>{APPRAISAL_STATUS[a.status]}</Badge>
                    {c.status === "open" && (a.status === "self_review" || a.status === "manager_review") && (
                      <Can perm="hrms.appraisal.manage">
                        <Button size="sm" variant="subtle" onClick={() => setReviewing(a.id)} aria-label={`Review ${a.employee_name}`}>Review</Button>
                        <Button size="sm" variant="ghost" disabled={cancel.busy}
                                onClick={async () => { if ((await cancel.run(a)) !== undefined) load(); }}>Drop</Button>
                      </Can>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Can perm="hrms.appraisal.manage">
            <div className="flex justify-end gap-2">
              {c.status === "draft" && <Button disabled={step.busy} onClick={async () => { if ((await step.run("open")) !== undefined) load(); }}>Open cycle</Button>}
              {c.status === "open" && <Button variant="subtle" disabled={step.busy} onClick={async () => { if ((await step.run("close")) !== undefined) load(); }}>Close cycle</Button>}
            </div>
          </Can>
        </div>
      )}
      {reviewing && <HrReview id={reviewing} onClose={() => { setReviewing(null); load(); }} />}
    </Dialog>
  );
}

function HrReview({ id, onClose }: { id: string; onClose: () => void }) {
  const [a, setA] = useState<Appraisal | null>(null);
  useEffect(() => { api<Appraisal>(`/hrms/appraisals/${id}`).then(setA).catch(() => onClose()); }, [id, onClose]);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={a ? `Review ${a.employee_name}` : "Review"} size="lg">
      {!a ? <LoadingRows rows={3} /> : (
        <>
          {a.status === "self_review" && <p className="mb-2 text-sm text-fg-muted">They haven't sent their self review yet; you can review now anyway.</p>}
          <AppraisalForm appraisal={a} side="manager" url={`/hrms/appraisals/${a.id}/manager-review`}
                         onSaved={(next) => { if (next.status === "done") onClose(); else setA(next); }} />
        </>
      )}
    </Dialog>
  );
}

// ── Templates ───────────────────────────────────────────────────────────────
function Templates() {
  const [rows, setRows] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Template[]>("/hrms/appraisal-templates").then(setRows).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);
  return (
    <div className="space-y-3">
      <Can perm="hrms.appraisal.manage"><Button variant="subtle" onClick={() => setEditing("new")}>New KRA template</Button></Can>
      {error ? <ErrorState message={error} onRetry={load} /> : rows === null ? <LoadingRows rows={2} /> : rows.length === 0 ? (
        <EmptyState title="No KRA templates yet" hint="List what matters for a role, with weights that add up to 100." />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label="KRA templates">
          {rows.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span><span className="font-medium">{t.name}</span>
                <span className="block text-xs text-fg-muted">{t.kras.map((k) => `${k.title} ${k.weight}%`).join(" · ")}</span></span>
              <span className="flex items-center gap-2">
                {!t.active && <Badge>off</Badge>}
                <Can perm="hrms.appraisal.manage"><Button size="sm" variant="ghost" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}>Edit</Button></Can>
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
  const [name, setName] = useState(template?.name ?? "");
  const [active, setActive] = useState(template?.active ?? true);
  const [kras, setKras] = useState(template?.kras.map(({ title, description, weight }) => ({ title, description, weight }))
                                   ?? [{ title: "", description: "", weight: 100 }]);
  const total = kras.reduce((s, k) => s + (Number(k.weight) || 0), 0);
  const save = useAction(
    () => {
      const body = { name, kras: kras.filter((k) => k.title.trim()) };
      return template
        ? api(`/hrms/appraisal-templates/${template.id}`, { method: "PATCH", body: JSON.stringify({ ...body, active }) })
        : api("/hrms/appraisal-templates", { method: "POST", body: JSON.stringify(body) });
    },
    { success: "Template saved", failure: "Couldn't save it" },
  );
  const set = (i: number, patch: Partial<(typeof kras)[number]>) => setKras(kras.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={template ? `Edit ${template.name}` : "New KRA template"} size="lg">
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if ((await save.run()) !== undefined) { onSaved(); onClose(); } }}>
        <Field label="Name"><Input value={name} required maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Shop floor staff" /></Field>
        {template && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> In use</label>}
        <ul className="space-y-2" aria-label="KRAs">
          {kras.map((k, i) => (
            <li key={i} className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1"><Field label={`KRA ${i + 1}`}><Input value={k.title} maxLength={200} onChange={(e) => set(i, { title: e.target.value })} /></Field></div>
              <div className="w-24"><Field label="Weight %"><Input type="number" min={1} max={100} value={k.weight} onChange={(e) => set(i, { weight: Number(e.target.value) })} /></Field></div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setKras(kras.filter((_, j) => j !== i))} aria-label={`Remove KRA ${i + 1}`}>Remove</Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" size="sm" variant="subtle" onClick={() => setKras([...kras, { title: "", description: "", weight: 0 }])}>Add a KRA</Button>
          <span className={total === 100 ? "text-sm text-fg-muted" : "text-sm font-medium text-danger"} aria-live="polite">Total {total}% {total === 100 ? "" : "(must be 100)"}</span>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.busy || !name.trim() || total !== 100}>Save</Button>
        </div>
      </form>
    </Dialog>
  );
}

