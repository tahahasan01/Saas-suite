"use client";

import { useCallback, useEffect, useState } from "react";
import { LEAVE_TYPES, type Employee, type Leave } from "@business-os/types";
import { api } from "@/lib/api";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

const tone = { pending: "warning", approved: "success", rejected: "danger" } as const;
const blank = { employee_id: "", leave_type: "annual", from_date: "", to_date: "", reason: "" };

export default function LeavePage() {
  const [items, setItems] = useState<Leave[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState(blank);

  const load = useCallback(async () => {
    const [lv, emp] = await Promise.all([api<Leave[]>("/hrms/leave"), api<Employee[]>("/hrms/employees")]);
    setItems(lv);
    setEmployees(emp);
    setForm((f) => ({ ...f, employee_id: f.employee_id || emp[0]?.id || "" }));
  }, []);
  useEffect(() => { load().catch(() => {}); }, [load]);

  async function decide(id: string, d: "approve" | "reject") {
    await api(`/hrms/leave/${id}/${d}`, { method: "POST" }).catch(() => {});
    load();
  }
  async function request(e: React.FormEvent) {
    e.preventDefault();
    await api("/hrms/leave", { method: "POST", body: JSON.stringify(form) }).catch(() => {});
    setForm({ ...blank, employee_id: employees[0]?.id ?? "" });
    load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-subtle">
              <th className="p-3">Employee</th>
              <th className="p-3">Type</th>
              <th className="p-3">Dates</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-fg-subtle">No leave requests.</td></tr>}
            {items.map((l) => (
              <tr key={l.id} className="border-b border-line/60">
                <td className="p-3 font-medium">{l.employee_name}</td>
                <td className="p-3 capitalize text-fg-muted">{l.leave_type}</td>
                <td className="p-3 text-fg-muted">{l.from_date} → {l.to_date}</td>
                <td className="p-3"><Badge tone={tone[l.status]}>{l.status}</Badge></td>
                <td className="p-3 text-right">
                  {l.status === "pending" && (
                    <span className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => decide(l.id, "approve")}>Approve</Button>
                      <Button size="sm" variant="subtle" onClick={() => decide(l.id, "reject")}>Reject</Button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Request leave</h2>
        <form onSubmit={request} className="space-y-3">
          <Field label="Employee">
            <Select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>
              {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From"><Input type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} required /></Field>
            <Field label="To"><Input type="date" value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} required /></Field>
          </div>
          <Field label="Reason"><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
          <Button type="submit" disabled={!form.employee_id} className="w-full">Submit request</Button>
        </form>
      </Card>
    </div>
  );
}
