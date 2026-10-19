"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Holiday } from "@business-os/types";
import { api, ApiError } from "@/lib/api";
import { dayPKT } from "@/lib/dates";
import { errorText, useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";

/* Holidays are tenant-owned rather than seeded: Pakistan's Eid dates are lunar
   and announced by the moon-sighting committee, so shipping a fixed table would
   silently mis-compute payroll every year. Businesses also differ on which
   optional holidays they observe. */

// The national holidays that fall on the same date every year. Was a 2026-only
// list, which would have quietly added last year's dates from January 2027.
const FIXED_PK: [string, string][] = [
  ["02-05", "Kashmir Day"],
  ["03-23", "Pakistan Day"],
  ["05-01", "Labour Day"],
  ["08-14", "Independence Day"],
  ["11-09", "Iqbal Day"],
  ["12-25", "Quaid-e-Azam Day"],
];
const fixedFor = (year: number) => FIXED_PK.map(([md, name]) => ({ holiday_date: `${year}-${md}`, name }));

// A date-only string is midnight UTC; format it in UTC so it can't slip a day.
const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

type FixedResult = { added: string[]; skipped: string[] };

export default function HolidaysPage() {
  const thisYear = Number(dayPKT().slice(0, 4));
  const [items, setItems] = useState<Holiday[] | null>(null); // null = loading
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({ holiday_date: "", name: "" });
  const [year, setYear] = useState(thisYear);
  const [removing, setRemoving] = useState<Holiday | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    api<Holiday[]>("/hrms/holidays")
      .then(setItems)
      .catch((e) => setLoadError(errorText(e, "Couldn't load holidays.")));
  }, []);
  useEffect(load, [load]);

  const byDate = useMemo(() => new Map((items ?? []).map((h) => [h.holiday_date, h])), [items]);
  // The server keeps one holiday per date and renames on a repeat, so say so
  // before someone overwrites "Eid-ul-Adha" by accident.
  const clash = form.holiday_date ? byDate.get(form.holiday_date) : undefined;

  const create = useAction(
    () => api<Holiday>("/hrms/holidays", { method: "POST", body: JSON.stringify(form) }),
    { success: (h) => `${(h as Holiday).name} added`, failure: "Couldn't add holiday" },
  );

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if ((await create.run()) === undefined) return;
    setForm({ holiday_date: "", name: "" });
    load();
  }

  // DELETE answers 204 with no body; return true so success is distinguishable.
  const del = useAction(
    async (h: Holiday) => { await api(`/hrms/holidays/${h.id}`, { method: "DELETE" }); return true; },
    { success: "Holiday removed", failure: "Couldn't remove holiday" },
  );

  async function confirmRemove() {
    if (!removing) return;
    if (await del.run(removing)) setRemoving(null);
    load();
  }

  const fixed = fixedFor(year);
  const missing = fixed.filter((f) => !byDate.has(f.holiday_date));

  // Dates already on the list are skipped, not re-posted: the server would
  // rename whatever the business called that day. One failure no longer aborts
  // the rest silently; what was added is kept and the failure is reported.
  const addFixed = useAction(
    async (): Promise<FixedResult> => {
      const added: string[] = [];
      const skipped = fixed.filter((f) => byDate.has(f.holiday_date)).map((f) => f.name);
      const failed: string[] = [];
      try {
        for (const f of missing) {
          try {
            await api("/hrms/holidays", { method: "POST", body: JSON.stringify(f) });
            added.push(f.name);
          } catch (e) {
            failed.push(`${f.name} (${errorText(e)})`);
          }
        }
      } finally {
        load();
      }
      if (failed.length) {
        throw new ApiError(0, `${added.length ? `Added ${added.join(", ")}. ` : ""}Couldn't add ${failed.join("; ")}`);
      }
      return { added, skipped };
    },
    {
      success: (r) => {
        const { added, skipped } = r as FixedResult;
        return `Added ${added.length} holiday${added.length === 1 ? "" : "s"}${
          skipped.length ? ` · skipped ${skipped.join(", ")} (already on the list)` : ""}`;
      },
      failure: "Some holidays weren't added",
    },
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 self-start rounded-xl border border-line bg-surface">
        <div className="border-b border-line px-4 py-2.5">
          <p className="text-xs text-fg-subtle">
            Holidays are excluded from working days, so they change every payslip.
          </p>
        </div>
        {loadError ? (
          <div className="p-4"><ErrorState message={loadError} onRetry={load} /></div>
        ) : !items ? (
          <div className="p-4"><LoadingRows label="Loading holidays" /></div>
        ) : items.length === 0 ? (
          <div className="p-4"><EmptyState title="No holidays yet" hint="Add the fixed national holidays, then Eid and Muharram once announced." /></div>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-28 shrink-0 text-sm tabular-nums text-fg-muted">{fmtDate(h.holiday_date)}</span>
                <span className="min-w-0 flex-1 break-words text-sm">{h.name}</span>
                <Button size="sm" variant="ghost" onClick={() => setRemoving(h)} aria-label={`Remove ${h.name}`}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="min-w-0 space-y-4">
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
            {clash && (
              <p className="text-xs text-warning">
                {fmtDate(clash.holiday_date)} is already “{clash.name}”. Saving renames it.
              </p>
            )}
            <Button type="submit" disabled={create.busy} className="w-full">
              {create.busy ? "Adding…" : clash ? "Rename holiday" : "Add holiday"}
            </Button>
          </form>
        </Card>

        <Card className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-sm font-semibold">Pakistan public holidays {year}</h2>
            <Field label="Year">
              <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="block w-28">
                {[thisYear - 1, thisYear, thisYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
            </Field>
          </div>
          <p className="text-xs text-fg-muted">
            The six fixed national holidays. Eid and Muharram move each year with the
            moon sighting, so add those yourself once announced.
          </p>
          <ul className="space-y-1 text-xs">
            {fixed.map((f) => (
              <li key={f.holiday_date} className="flex justify-between gap-2">
                <span>{f.name} <span className="text-fg-subtle">· {fmtDate(f.holiday_date)}</span></span>
                {byDate.has(f.holiday_date) && <span className="shrink-0 text-success">✓ on the list</span>}
              </li>
            ))}
          </ul>
          <Button variant="subtle" onClick={() => addFixed.run()} disabled={addFixed.busy || missing.length === 0 || !items} className="w-full">
            {addFixed.busy ? "Adding…" : missing.length === 0 ? `All six are on the list` : `Add the ${missing.length} missing for ${year}`}
          </Button>
        </Card>
      </div>

      <Dialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this holiday?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmRemove} disabled={del.busy}>{del.busy ? "Removing…" : "Remove"}</Button>
          </>
        }
      >
        {removing && (
          <p className="text-sm text-fg-muted">
            <span className="font-medium text-fg">{removing.name}</span> ({fmtDate(removing.holiday_date)}) becomes a
            working day again. Payroll for that month will expect attendance on it, and anyone who stayed home
            will be marked absent.
          </p>
        )}
      </Dialog>
    </div>
  );
}
