"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Employee } from "@business-os/types";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { Badge, Button, Card, Field, Input } from "@/components/ui";

const blank = { name: "", designation: "", department: "", cnic: "", salary: "", join_date: "" };

export default function EmployeesPage() {
  const [items, setItems] = useState<Employee[]>([]);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    api<Employee[]>("/hrms/employees").then(setItems).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hits = needle
      ? items.filter((e) =>
          [e.name, e.designation, e.department].some((f) => f.toLowerCase().includes(needle)))
      : items;
    const by = new Map<string, Employee[]>();
    for (const e of hits) {
      const key = e.department || "Unassigned";
      by.set(key, [...(by.get(key) ?? []), e]);
    }
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items, q]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/hrms/employees", {
        method: "POST",
        body: JSON.stringify({
          name: form.name, designation: form.designation, department: form.department,
          cnic: form.cnic, salary_minor: Math.round(Number(form.salary || 0) * 100),
          join_date: form.join_date || null,
        }),
      });
      setForm(blank);
      setAdding(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, role or department…"
          className="max-w-xs"
          aria-label="Search team"
        />
        <span className="text-xs text-fg-subtle">
          {items.filter((e) => e.present_today).length} of {items.length} in today
        </span>
        <Button className="ml-auto" onClick={() => setAdding((v) => !v)} variant={adding ? "subtle" : "primary"}>
          {adding ? "Cancel" : "Add employee"}
        </Button>
      </div>

      {adding && (
        <Card>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="Designation"><Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></Field>
            <Field label="Department"><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></Field>
            <Field label="CNIC"><Input value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} placeholder="35201-XXXXXXX-X" /></Field>
            <Field label="Salary (PKR)"><Input type="number" min={0} value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></Field>
            <Field label="Join date"><Input type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} /></Field>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add employee"}</Button>
            </div>
          </form>
        </Card>
      )}

      {groups.length === 0 ? (
        <Card><p className="py-8 text-center text-sm text-fg-subtle">{q ? "No one matches that search." : "No employees yet."}</p></Card>
      ) : (
        groups.map(([dept, staff]) => (
          <section key={dept}>
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              {dept}
              <span className="font-normal normal-case tracking-normal">· {staff.length}</span>
            </h2>
            <Card className="p-0">
              <ul className="divide-y divide-line">
                {staff.map((e) => <Row key={e.id} e={e} />)}
              </ul>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}

function Row({ e }: { e: Employee }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar name={e.name} present={e.present_today} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{e.name}</p>
        <p className="truncate text-xs text-fg-muted">{e.designation || "—"}{e.cnic && ` · ${e.cnic}`}</p>
      </div>
      <div className="hidden text-right sm:block">
        <p className="text-xs text-fg-subtle">Tenure</p>
        <p className="text-sm tabular-nums">{tenure(e.join_date)}</p>
      </div>
      <div className="w-28 text-right">
        <p className="text-sm tabular-nums">{money(e.salary_minor)}</p>
      </div>
      <div className="w-20 text-right">
        {e.present_today ? <Badge tone="success">In today</Badge> : <Badge>Out</Badge>}
      </div>
    </li>
  );
}

/** Initials avatar; the ring doubles as today's presence so status isn't colour-only. */
function Avatar({ name, present }: { name: string; present: boolean }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <span
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
