"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Employee } from "@business-os/types";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows } from "@/components/ui";
import { useHrmsSummary } from "./summary";

const blank = { name: "", designation: "", department: "", cnic: "", salary: "", join_date: "" };
const toMinor = (rupees: string) => Math.round(Number(rupees || 0) * 100);

export default function EmployeesPage() {
  const { refresh: refreshSummary } = useHrmsSummary();
  // null = still loading; "No employees yet" while loading told owners their staff were gone.
  const [items, setItems] = useState<Employee[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    api<Employee[]>("/hrms/employees")
      .then(setItems)
      .catch((e) => setLoadError(errorText(e, "Couldn't load your team.")));
  }, []);
  useEffect(load, [load]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = items ?? [];
    const hits = needle
      ? all.filter((e) =>
          [e.name, e.designation, e.department].some((f) => f.toLowerCase().includes(needle)))
      : all;
    const by = new Map<string, Employee[]>();
    for (const e of hits) {
      const key = e.department || "Unassigned";
      by.set(key, [...(by.get(key) ?? []), e]);
    }
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items, q]);

  const payMasked = !!items?.some((e) => e.pay_masked);

  const create = useAction(
    () => api("/hrms/employees", {
      method: "POST",
      body: JSON.stringify({
        name: form.name, designation: form.designation, department: form.department,
        cnic: form.cnic, salary_minor: payMasked ? 0 : toMinor(form.salary),
        join_date: form.join_date || null,
      }),
    }),
    { success: "Employee added", failure: "Couldn't add employee" },
  );

  async function add(e: React.FormEvent) {
    e.preventDefault();
    // `run` resolves undefined on failure; the form keeps what was typed.
    if ((await create.run()) === undefined) return;
    setForm(blank);
    setAdding(false);
    load();
    refreshSummary();
  }

  const changed = () => { load(); refreshSummary(); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, role or department…"
          className="w-full sm:w-72"
          aria-label="Search team"
        />
        {items && (
          <span className="text-xs text-fg-subtle">
            {items.filter((e) => e.present_today).length} of {items.length} in today
          </span>
        )}
        <Button className="ml-auto" onClick={() => setAdding((v) => !v)} variant={adding ? "subtle" : "primary"} aria-expanded={adding}>
          {adding ? "Cancel" : "Add employee"}
        </Button>
      </div>

      {adding && (
        <Card>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus /></Field>
            <Field label="Designation"><Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></Field>
            <Field label="Department"><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></Field>
            <Field label="CNIC"><Input value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} placeholder="35201-XXXXXXX-X" /></Field>
            {/* Pay is set by payroll; a list that came back masked means this login can't. */}
            {!payMasked && (
              <Field label="Salary (PKR)"><Input type="number" inputMode="decimal" min={0} value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></Field>
            )}
            <Field label="Join date"><Input type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} /></Field>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={create.busy}>{create.busy ? "Saving…" : "Save employee"}</Button>
            </div>
          </form>
        </Card>
      )}

      {loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : !items ? (
        <LoadingRows rows={4} label="Loading team" />
      ) : groups.length === 0 ? (
        <EmptyState
          title={q ? "No one matches that search." : "No employees yet."}
          hint={q ? undefined : "Add your first employee to start tracking attendance and payroll."}
        />
      ) : (
        groups.map(([dept, staff]) => (
          <section key={dept}>
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              {dept}
              <span className="font-normal normal-case tracking-normal">· {staff.length}</span>
            </h2>
            {/* Edge-to-edge rows: card padding cost a phone 40px of row width. */}
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {staff.map((e) => <Row key={e.id} e={e} onChanged={changed} onEdit={() => setEditing(e)} />)}
            </ul>
          </section>
        ))
      )}

      {editing && <EditEmployee e={editing} onClose={() => setEditing(null)} onSaved={changed} />}
    </div>
  );
}

/* Name and role come first and always get the room they need; the figures
 * wrap onto their own line on a narrow screen. Fixed widths summed to 404px
 * before, which squeezed the name to nothing at 320. */
function Row({ e, onChanged, onEdit }: { e: Employee; onChanged: () => void; onEdit: () => void }) {
  const [sent, setSent] = useState(false);
  // The invite answers 204 (no body), so return true to tell success from failure.
  const invite = useAction(
    async () => { await api(`/hrms/employees/${e.id}/invite`, { method: "POST" }); return true; },
    { success: `Invite sent to ${e.name}`, failure: "Couldn't send invite" },
  );

  async function sendInvite() {
    if (!(await invite.run())) return;
    setSent(true);
    onChanged();
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <Avatar name={e.name} present={e.present_today} />
      <div className="min-w-0 flex-1 basis-40">
        <p className="break-words text-sm font-medium">{e.name}</p>
        <p className="truncate text-xs text-fg-muted">{e.designation || "—"}{e.cnic && ` · ${e.cnic}`}</p>
      </div>
      {/* On a phone this whole group drops below the name, indented to line up with it. */}
      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 pl-12 sm:w-auto sm:flex-nowrap sm:pl-0">
        <div className="hidden text-right md:block">
          <p className="text-xs text-fg-subtle">Tenure</p>
          <p className="text-sm tabular-nums">{tenure(e.join_date)}</p>
        </div>
        <p className="text-sm tabular-nums sm:w-28 sm:text-right">
          <span className="sr-only">Salary </span>
          {e.salary_minor === null ? <span className="text-fg-subtle">Hidden</span> : money(e.salary_minor)}
        </p>
        {e.present_today ? <Badge tone="success">In today</Badge> : <Badge>Out</Badge>}
        <div className="ml-auto flex items-center gap-1.5 sm:ml-0">
          {e.has_login ? (
            <Badge tone="brand">Portal</Badge>
          ) : sent ? (
            <span className="text-xs text-success">Invite sent</span>
          ) : (
            <Button size="sm" variant="ghost" onClick={sendInvite} disabled={invite.busy}>
              {invite.busy ? "Sending…" : "Enable login"}
            </Button>
          )}
          <Button size="sm" variant="subtle" onClick={onEdit} aria-label={`Edit ${e.name}`}>Edit</Button>
        </div>
      </div>
    </li>
  );
}

function EditEmployee({ e, onClose, onSaved }: { e: Employee; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: e.name, designation: e.designation, department: e.department,
    salary: e.salary_minor === null ? "" : String(e.salary_minor / 100),
  });
  const save = useAction(
    () => api(`/hrms/employees/${e.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: f.name, designation: f.designation, department: f.department,
        // Without payroll access the salary is hidden, so it is never sent back.
        ...(e.pay_masked ? {} : { salary_minor: toMinor(f.salary) }),
      }),
    }),
    { success: "Saved", failure: "Couldn't save changes" },
  );

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if ((await save.run()) === undefined) return;
    onSaved();
    onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Edit ${e.name}`}
      description={e.pay_masked ? undefined : "Salary changes apply to this month's payroll."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="edit-employee" disabled={save.busy || !f.name.trim()}>{save.busy ? "Saving…" : "Save"}</Button>
        </>
      }
    >
      <form id="edit-employee" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={f.name} required onChange={(ev) => setF({ ...f, name: ev.target.value })} /></Field>
        <Field label="Designation"><Input value={f.designation} onChange={(ev) => setF({ ...f, designation: ev.target.value })} /></Field>
        <Field label="Department"><Input value={f.department} onChange={(ev) => setF({ ...f, department: ev.target.value })} /></Field>
        {!e.pay_masked && (
          <Field label="Salary (PKR)"><Input type="number" inputMode="decimal" min={0} value={f.salary} onChange={(ev) => setF({ ...f, salary: ev.target.value })} /></Field>
        )}
      </form>
    </Dialog>
  );
}

/** Initials avatar; the ring doubles as today's presence so status isn't colour-only. */
function Avatar({ name, present }: { name: string; present: boolean }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <span
      aria-hidden
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-elevated text-xs font-semibold text-fg-muted ring-2 ${
        present ? "ring-success" : "ring-transparent"
      }`}
    >
      {initials}
    </span>
  );
}

function tenure(join: string | null) {
  if (!join) return "—";
  const months = Math.max(0, Math.round((Date.now() - new Date(join).getTime()) / 2_629_800_000));
  if (months < 12) return `${months}mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem ? `${years}y ${rem}mo` : `${years}y`;
}
