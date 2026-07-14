"use client";

import { useCallback, useEffect, useState } from "react";
import type { Holiday } from "@business-os/types";
import { api } from "@/lib/api";
import { Button, Card, Field, Input } from "@/components/ui";

/* Holidays are tenant-owned rather than seeded: Pakistan's Eid dates are lunar
   and announced by the moon-sighting committee, so shipping a fixed table would
   silently mis-compute payroll every year. Businesses also differ on which
   optional holidays they observe. */

const FIXED_PK_2026: [string, string][] = [
  ["2026-02-05", "Kashmir Day"],
  ["2026-03-23", "Pakistan Day"],
  ["2026-05-01", "Labour Day"],
  ["2026-08-14", "Independence Day"],
  ["2026-11-09", "Iqbal Day"],
  ["2026-12-25", "Quaid-e-Azam Day"],
];

export default function HolidaysPage() {
  const [items, setItems] = useState<Holiday[]>([]);
  const [form, setForm] = useState({ holiday_date: "", name: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Holiday[]>("/hrms/holidays").then(setItems).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/hrms/holidays", { method: "POST", body: JSON.stringify(form) });
      setForm({ holiday_date: "", name: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await api(`/hrms/holidays/${id}`, { method: "DELETE" });
    load();
  }

  async function addFixed() {
    setBusy(true);
    try {
      for (const [holiday_date, name] of FIXED_PK_2026) {
        await api("/hrms/holidays", { method: "POST", body: JSON.stringify({ holiday_date, name }) });
      }
      load();
    } finally {
      setBusy(false);
    }
  }

  const missingFixed = FIXED_PK_2026.some(([d]) => !items.some((h) => h.holiday_date === d));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-0">
        <div className="border-b border-line px-4 py-2.5">
          <p className="text-xs text-fg-subtle">
            Holidays are excluded from working days, so they change every payslip.
          </p>
        </div>
        {items.length === 0 ? (
          <p className="p-6 text-center text-sm text-fg-subtle">No holidays yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-28 shrink-0 text-sm tabular-nums text-fg-muted">
                  {new Date(h.holiday_date).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
                </span>
                <span className="flex-1 text-sm">{h.name}</span>
                <Button size="sm" variant="ghost" onClick={() => remove(h.id)}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="space-y-4">
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">Add holiday</h2>
          <form onSubmit={add} className="space-y-3">
            <Field label="Date">
              <Input type="date" value={form.holiday_date} required
                     onChange={(e) => setForm({ ...form, holiday_date: e.target.value })} />
            </Field>
            <Field label="Name">
              <Input value={form.name} required placeholder="e.g. Eid-ul-Fitr"
                     onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">{busy ? "Adding…" : "Add holiday"}</Button>
          </form>
        </Card>

        {missingFixed && (
          <Card className="space-y-2">
            <h2 className="text-sm font-semibold">Pakistan public holidays 2026</h2>
            <p className="text-xs text-fg-muted">
              Adds the six fixed national holidays. Eid and Muharram move each year with the
              moon sighting, so add those yourself once announced.
            </p>
            <Button variant="subtle" onClick={addFixed} disabled={busy} className="w-full">
              Add the 6 fixed holidays
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
