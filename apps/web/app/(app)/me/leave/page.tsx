"use client";

import { useCallback, useEffect, useState } from "react";
import { LEAVE_TYPES, type Leave } from "@business-os/types";
import { api, ApiError } from "@/lib/api";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

interface Balance { leave_type: string; quota: number; used: number; remaining: number }

const tone = { pending: "warning", approved: "success", rejected: "danger" } as const;
const blank = { request_type: "leave", leave_type: "annual", from_date: "", to_date: "", reason: "" };

export default function MyLeave() {
  const [items, setItems] = useState<Leave[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [form, setForm] = useState(blank);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const load = useCallback(() => {
    api<Leave[]>("/me/leave").then(setItems).catch(() => setItems([]));
    api<Balance[]>("/me/leave/balances").then(setBalances).catch(() => setBalances([]));
  }, []);
  useEffect(load, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(false);
    try {
      // employee_id is ignored server-side and forced to the caller.
      await api("/me/leave", { method: "POST", body: JSON.stringify({ ...form, employee_id: "self" }) });
      setForm(blank);
      setOk(true);
      load();
    } catch (e) {
      setErr(e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Couldn't submit that request.");
    }
  }

  const isWfh = form.request_type === "wfh";

  return (
    <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1fr_300px]">
      <div>
        <h1 className="mb-4 text-xl font-semibold">My leave</h1>
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-subtle">
                <th className="p-3">Type</th>
                <th className="p-3">Dates</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={3} className="p-6 text-center text-fg-subtle">No requests yet.</td></tr>
              )}
              {items.map((l) => (
                <tr key={l.id} className="border-b border-line/60">
                  <td className="p-3">
                    {l.request_type === "wfh" ? <Badge tone="brand">Work from home</Badge>
                      : <span className="capitalize text-fg-muted">{l.leave_type}</span>}
                  </td>
                  <td className="p-3 text-fg-muted">{l.from_date} → {l.to_date}</td>
                  <td className="p-3"><Badge tone={tone[l.status]}>{l.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {balances.map((b) => (
            <Card key={b.leave_type} className="text-center">
              <p className="text-lg font-semibold tabular-nums">{b.remaining}</p>
              <p className="text-[10px] capitalize text-fg-subtle">{b.leave_type} left</p>
            </Card>
          ))}
        </div>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">New request</h2>
          <form onSubmit={submit} className="space-y-3">
            <Field label="Request">
              <Select value={form.request_type} onChange={(e) => setForm({ ...form, request_type: e.target.value })}>
                <option value="leave">Leave</option>
                <option value="wfh">Work from home</option>
              </Select>
            </Field>
            {!isWfh && (
              <Field label="Leave type">
                <Select value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>
                  {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="From"><Input type="date" value={form.from_date} required onChange={(e) => setForm({ ...form, from_date: e.target.value })} /></Field>
              <Field label="To"><Input type="date" value={form.to_date} required onChange={(e) => setForm({ ...form, to_date: e.target.value })} /></Field>
            </div>
            <Field label="Reason"><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
            {err && <p className="text-xs text-danger">{err}</p>}
            {ok && <p className="text-xs text-success">Request submitted — your manager will review it.</p>}
            <Button type="submit" className="w-full">Submit</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
