"use client";

import { useCallback, useEffect, useState } from "react";
import type { Employee } from "@business-os/types";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { Button, Card, Field, Input } from "@/components/ui";

const blank = { name: "", designation: "", department: "", cnic: "", salary: "", join_date: "" };

export default function EmployeesPage() {
  const [items, setItems] = useState<Employee[]>([]);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Employee[]>("/hrms/employees").then(setItems).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

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
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-subtle">
              <th className="p-3">Name</th>
              <th className="p-3">Role</th>
              <th className="p-3">Department</th>
              <th className="p-3">Salary</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-fg-subtle">No employees yet.</td></tr>}
            {items.map((e) => (
              <tr key={e.id} className="border-b border-line/60">
                <td className="p-3">
                  <p className="font-medium">{e.name}</p>
                  {e.cnic && <p className="text-xs text-fg-subtle">{e.cnic}</p>}
                </td>
                <td className="p-3 text-fg-muted">{e.designation || "—"}</td>
                <td className="p-3 text-fg-muted">{e.department || "—"}</td>
                <td className="p-3">{money(e.salary_minor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Add employee</h2>
        <form onSubmit={add} className="space-y-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Designation"><Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></Field>
            <Field label="Department"><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></Field>
          </div>
          <Field label="CNIC"><Input value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} placeholder="35201-XXXXXXX-X" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Salary (PKR)"><Input type="number" min={0} value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></Field>
            <Field label="Join date"><Input type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} /></Field>
          </div>
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Adding…" : "Add employee"}</Button>
        </form>
      </Card>
    </div>
  );
}
