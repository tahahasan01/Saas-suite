"use client";

import { useCallback, useEffect, useState } from "react";
import type { Department, JobTitle } from "@business-os/types";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { errorText, useAction } from "@/lib/useAction";
import { Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";

/* Departments (a tree: a store under Operations) and job titles. Employees'
   old typed-in departments and designations were grouped into these when
   this screen arrived; merge any near-duplicates by renaming one to match. */
export default function OrgSetup() {
  const [depts, setDepts] = useState<Department[] | null>(null);
  const [titles, setTitles] = useState<JobTitle[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([api<Department[]>("/hrms/departments"), api<JobTitle[]>("/hrms/job-titles")])
      .then(([d, t]) => { setDepts(d); setTitles(t); })
      .catch((e) => setError(errorText(e, "Couldn't load departments.")));
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!depts || !titles) return <LoadingRows rows={4} label="Loading departments" />;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Departments depts={depts} onChanged={load} />
      <Titles titles={titles} depts={depts} onChanged={load} />
    </div>
  );
}

/** Depth-first order with each department's path, so the tree reads as one list. */
function ordered(depts: Department[]): { d: Department; depth: number }[] {
  const kids = new Map<string | null, Department[]>();
  for (const d of depts) kids.set(d.parent_id, [...(kids.get(d.parent_id) ?? []), d]);
  const out: { d: Department; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const d of (kids.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      out.push({ d, depth });
      walk(d.id, depth + 1);
    }
  };
  walk(null, 0);
  for (const d of depts) if (!seen.has(d.id)) out.push({ d, depth: 0 }); // a parent this list can't see
  return out;
}

function Departments({ depts, onChanged }: { depts: Department[]; onChanged: () => void }) {
  const [f, setF] = useState({ name: "", parent_id: "" });
  const add = useAction(
    () => api("/hrms/departments", { method: "POST", body: JSON.stringify({ name: f.name, parent_id: f.parent_id || null }) }),
    { success: "Department added", failure: "Couldn't add the department" },
  );
  const patch = useAction(
    (id: string, body: object) => api(`/hrms/departments/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    { success: "Saved", failure: "Couldn't save" },
  );
  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold">Departments</h2>
      {depts.length === 0 ? <EmptyState title="No departments yet" /> : (
        <ul className="divide-y divide-line">
          {ordered(depts).map(({ d, depth }) => (
            <DeptRow key={d.id} d={d} depth={depth} depts={depts}
                     onSave={async (body) => { if ((await patch.run(d.id, body)) !== undefined) onChanged(); }} />
          ))}
        </ul>
      )}
      <Can perm="hrms.org.manage">
        <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
          e.preventDefault();
          if ((await add.run()) !== undefined) { setF({ name: "", parent_id: "" }); onChanged(); }
        }}>
          <Field label="New department"><Input value={f.name} required maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Under">
            <Select value={f.parent_id} onChange={(e) => setF({ ...f, parent_id: e.target.value })}>
              <option value="">— top level —</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Button type="submit" variant="subtle" disabled={add.busy}>{add.busy ? "Adding…" : "Add"}</Button>
        </form>
      </Can>
    </Card>
  );
}

function DeptRow({ d, depth, depts, onSave }: {
  d: Department; depth: number; depts: Department[]; onSave: (body: object) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(d.name);
  const [parent, setParent] = useState(d.parent_id ?? "");
  if (editing) {
    return (
      <li className="flex flex-wrap items-end gap-2 py-2">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Under">
          <Select value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">— top level —</option>
            {depts.filter((x) => x.id !== d.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        <Button size="sm" onClick={async () => { await onSave({ name, parent_id: parent || null }); setEditing(false); }}>Save</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 py-2 text-sm" style={{ paddingInlineStart: `${depth * 16}px` }}>
      <span className="min-w-0 flex-1 break-words">{depth > 0 && <span aria-hidden className="text-fg-subtle">└ </span>}{d.name}</span>
      <span className="text-xs tabular-nums text-fg-subtle">{d.headcount} staff</span>
      <Can perm="hrms.org.manage">
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Edit ${d.name}`}>Edit</Button>
      </Can>
    </li>
  );
}

function TitleRow({ t, dept, onRename }: { t: JobTitle; dept?: string; onRename: (name: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(t.name);
  if (editing) {
    return (
      <li className="flex flex-wrap items-end gap-2 py-2">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Button size="sm" disabled={!name.trim()} onClick={async () => { await onRename(name.trim()); setEditing(false); }}>Save</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 py-2 text-sm">
      <span className="min-w-0 flex-1 break-words">{t.name}</span>
      {dept && <span className="text-xs text-fg-subtle">{dept}</span>}
      <Can perm="hrms.org.manage">
        <Button size="sm" variant="ghost" aria-label={`Rename ${t.name}`} onClick={() => setEditing(true)}>Rename</Button>
      </Can>
    </li>
  );
}

function Titles({ titles, depts, onChanged }: { titles: JobTitle[]; depts: Department[]; onChanged: () => void }) {
  const [f, setF] = useState({ name: "", department_id: "" });
  const add = useAction(
    () => api("/hrms/job-titles", { method: "POST", body: JSON.stringify({ name: f.name, department_id: f.department_id || null }) }),
    { success: "Job title added", failure: "Couldn't add the job title" },
  );
  const rename = useAction(
    (id: string, name: string) => api(`/hrms/job-titles/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
    { success: "Renamed", failure: "Couldn't rename" },
  );
  const deptName = new Map(depts.map((d) => [d.id, d.name]));
  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold">Job titles</h2>
      {titles.length === 0 ? <EmptyState title="No job titles yet" /> : (
        <ul className="divide-y divide-line">
          {titles.map((t) => (
            <TitleRow key={t.id} t={t} dept={t.department_id ? deptName.get(t.department_id) : undefined}
                      onRename={async (name) => { if ((await rename.run(t.id, name)) !== undefined) onChanged(); }} />
          ))}
        </ul>
      )}
      <Can perm="hrms.org.manage">
        <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
          e.preventDefault();
          if ((await add.run()) !== undefined) { setF({ name: "", department_id: "" }); onChanged(); }
        }}>
          <Field label="New job title"><Input value={f.name} required maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Department">
            <Select value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })}>
              <option value="">Any</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Button type="submit" variant="subtle" disabled={add.busy}>{add.busy ? "Adding…" : "Add"}</Button>
        </form>
      </Can>
    </Card>
  );
}
