"use client";

import { useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { dayPKT } from "@/lib/dates";
import { formatDay, money } from "@/lib/format";
import { fileUrl, uploadFile } from "@/lib/org";
import { useAction } from "@/lib/useAction";
import { Badge, Button, Field, Input, Select } from "@/components/ui";

export type Claim = Schema<"ExpenseClaimOut">;

export const CATEGORIES: Record<string, string> = {
  travel: "Travel", fuel: "Fuel", meals: "Meals", phone: "Phone", supplies: "Supplies", medical: "Medical",
  accommodation: "Stay", other: "Other",
};

/** Where a claim stands, in a shop owner's words. */
export function ClaimStatus({ c }: { c: Claim }) {
  if (c.status === "approved") return <Badge tone="success">{c.paid ? "paid" : c.pay_month ? `approved, paid with ${formatDay(c.pay_month, { month: "short", year: "numeric" })} salary` : "approved"}</Badge>;
  const tone = { submitted: "brand", rejected: "danger", cancelled: "neutral" } as const;
  return <Badge tone={tone[c.status as keyof typeof tone]}>{c.status === "submitted" ? "waiting" : c.status}</Badge>;
}

export function ClaimLines({ c }: { c: Claim }) {
  return (
    <ul className="divide-y divide-line text-sm" aria-label={`Lines of ${c.title}`}>
      {(c.lines ?? []).map((l) => (
        <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
          <span>{formatDay(l.spent_on)} · {CATEGORIES[l.category]}{l.description ? ` · ${l.description}` : ""}</span>
          <span className="flex items-center gap-2">
            {l.receipt_file_id && <a href={fileUrl(l.receipt_file_id)} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline">Receipt</a>}
            <span className="tabular-nums">{money(l.amount_minor)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

type Line = { spent_on: string; category: string; description: string; amount: string; file: File | null };
const blank = (): Line => ({ spent_on: dayPKT(), category: "travel", description: "", amount: "", file: null });

/** A new claim: a title and one or more lines, each with an optional
 *  receipt photo or PDF. `url` is /me/expenses, or /hrms/expenses with
 *  `employeeId` when HR claims for someone. */
export function ClaimForm({ url, employeeId, onDone }: { url: string; employeeId?: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState<Line[]>([blank()]);
  const total = lines.reduce((s, l) => s + Math.round((Number(l.amount) || 0) * 100), 0);
  const send = useAction(async () => {
    const out = [];
    for (const l of lines) {
      const receipt = l.file ? (await uploadFile(l.file)).id : null;
      out.push({ spent_on: l.spent_on, category: l.category, description: l.description,
                 amount_minor: Math.round(Number(l.amount) * 100), receipt_file_id: receipt });
    }
    return api<Claim>(url, { method: "POST", body: JSON.stringify({ title, lines: out, ...(employeeId ? { employee_id: employeeId } : {}) }) });
  }, { success: "Claim sent", failure: "Couldn't send the claim" });
  const set = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <form aria-label="New expense claim" className="space-y-3 text-sm"
          onSubmit={async (e) => { e.preventDefault(); if (await send.run()) { setTitle(""); setLines([blank()]); onDone(); } }}>
      <Field label="What for"><Input value={title} required maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder="Lahore client visit" /></Field>
      <ul className="space-y-3" aria-label="Expense lines">
        {lines.map((l, i) => (
          <li key={i} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[9rem_8rem_1fr_8rem]">
            <Field label={`Date ${i + 1}`}><Input type="date" required max={dayPKT()} value={l.spent_on} onChange={(e) => set(i, { spent_on: e.target.value })} /></Field>
            <Field label="Type">
              <Select value={l.category} onChange={(e) => set(i, { category: e.target.value })}>
                {Object.entries(CATEGORIES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Details"><Input value={l.description} maxLength={300} onChange={(e) => set(i, { description: e.target.value })} /></Field>
            <Field label={`Amount ${i + 1} (PKR)`}><Input type="number" required min={0.01} step="0.01" value={l.amount} onChange={(e) => set(i, { amount: e.target.value })} /></Field>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-4">
              <label className="text-xs text-fg-muted">Receipt (photo or PDF)
                <input type="file" accept="image/*,application/pdf" className="ms-2 text-xs" onChange={(e) => set(i, { file: e.target.files?.[0] ?? null })} />
              </label>
              {lines.length > 1 && <Button type="button" size="sm" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove line</Button>}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" size="sm" variant="subtle" onClick={() => setLines([...lines, blank()])}>Add a line</Button>
        <span className="font-medium tabular-nums">Total {money(total)}</span>
      </div>
      <div className="flex justify-end"><Button type="submit" disabled={send.busy || !title.trim() || total <= 0}>{send.busy ? "Sending…" : "Send claim"}</Button></div>
    </form>
  );
}
