"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PROVINCES, PROVINCE_NAMES, type Blackout, type Holiday, type HolidayCalendar, type ImportResult, type Province } from "@business-os/types";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { dayPKT } from "@/lib/dates";
import { formatDay } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { useConfirm } from "@/components/Confirm";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Select, Textarea, cx } from "@/components/ui";

/* Holidays are tenant-owned rather than seeded: Pakistan's Eid dates are lunar
   and announced by the moon-sighting committee, so a fixed table would
   silently mis-compute payroll every year. Each year the federal list is
   imported from a CSV (the government's notification, typed or exported);
   provinces get their own calendars — a Sindh holiday is not a Punjab one —
   and staff get the holidays of their work location's province. */

// A calendar date, formatted as written so it can't slip a day.
const fmtDate = (d: string) => formatDay(d);
const TEMPLATE = "Date,Name,Kind,Half day\n2026-03-23,Pakistan Day,public,no\n";

export default function HolidaysPage() {
  const thisYear = Number(dayPKT().slice(0, 4));
  const [calendars, setCalendars] = useState<HolidayCalendar[] | null>(null);
  const [calendarId, setCalendarId] = useState<string>("");
  const [items, setItems] = useState<Holiday[] | null>(null); // null = loading
  const [loadError, setLoadError] = useState<string | null>(null);
  const [year, setYear] = useState(thisYear);
  const [form, setForm] = useState({ holiday_date: "", name: "", kind: "public", half_day: false });
  const confirm = useConfirm();

  const loadCalendars = useCallback(() => {
    api<HolidayCalendar[]>("/hrms/holiday-calendars")
      .then((cs) => { setCalendars(cs); setCalendarId((id) => id || cs[0]?.id || ""); })
      .catch((e) => setLoadError(errorText(e, "Couldn't load holiday calendars.")));
  }, []);
  useEffect(loadCalendars, [loadCalendars]);

  const load = useCallback(() => {
    if (!calendarId) return;
    setLoadError(null);
    api<Holiday[]>(`/hrms/holidays?calendar_id=${calendarId}&year=${year}`)
      .then(setItems)
      .catch((e) => setLoadError(errorText(e, "Couldn't load holidays.")));
  }, [calendarId, year]);
  useEffect(load, [load]);

  const calendar = calendars?.find((c) => c.id === calendarId);
  const byDate = useMemo(() => new Map((items ?? []).map((h) => [h.holiday_date, h])), [items]);
  // The server keeps one holiday per date per calendar and renames on a
  // repeat, so say so before someone overwrites "Eid-ul-Adha" by accident.
  const clash = form.holiday_date ? byDate.get(form.holiday_date) : undefined;

  const create = useAction(
    () => api<Holiday>("/hrms/holidays", { method: "POST", body: JSON.stringify({ ...form, calendar_id: calendarId }) }),
    { success: (h) => `${(h as Holiday).name} added`, failure: "Couldn't add holiday" },
  );
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if ((await create.run()) === undefined) return;
    setForm({ holiday_date: "", name: "", kind: "public", half_day: false });
    load();
    loadCalendars();
  }

  // DELETE answers 204 with no body; return true so success is distinguishable.
  const del = useAction(
    async (h: Holiday) => { await api(`/hrms/holidays/${h.id}`, { method: "DELETE" }); return true; },
    { success: "Holiday removed", failure: "Couldn't remove holiday" },
  );
  function onRemove(h: Holiday) {
    void confirm({
      title: "Remove this holiday?",
      body: (
        <>
          <span className="font-medium text-fg">{h.name}</span> ({fmtDate(h.holiday_date)}) becomes a
          working day again. Payroll for that month will expect attendance on it, and anyone who stayed home
          will be marked absent.
        </>
      ),
      confirmLabel: "Remove",
      busyLabel: "Removing…",
      tone: "danger",
      // Reload whichever way it went: a failure may mean it was already gone.
      run: async () => { const done = await del.run(h); load(); return done; },
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-3 self-start">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Calendar">
            <Select value={calendarId} onChange={(e) => setCalendarId(e.target.value)} className="block w-56">
              {(calendars ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.province ? ` (${PROVINCE_NAMES[c.province]})` : ""}</option>
              ))}
            </Select>
          </Field>
          <Field label="Year">
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="block w-28">
              {[thisYear - 1, thisYear, thisYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </Field>
          {calendar && <p className="pb-2 text-xs text-fg-subtle">{scopeHint(calendar)}</p>}
        </div>

        <div className="rounded-xl border border-line bg-surface">
          <div className="border-b border-line px-4 py-2.5">
            <p className="text-xs text-fg-subtle">Holidays are excluded from working days and leave, so they change every payslip.</p>
          </div>
          {loadError ? (
            <div className="p-4"><ErrorState message={loadError} onRetry={load} /></div>
          ) : !items ? (
            <div className="p-4"><LoadingRows label="Loading holidays" /></div>
          ) : items.length === 0 ? (
            <div className="p-4"><EmptyState title={`No holidays in ${year} yet`} hint="Import this year's list, or add days one by one. Add Eid and Muharram once announced." /></div>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <span className="w-28 shrink-0 text-sm tabular-nums text-fg-muted">{fmtDate(h.holiday_date)}</span>
                  <span className="min-w-0 flex-1 break-words text-sm">{h.name}</span>
                  {h.kind === "optional" && <Badge>optional</Badge>}
                  {h.half_day && <Badge tone="warning">half day</Badge>}
                  <Can perm="hrms.holiday.manage">
                    <Button size="sm" variant="ghost" onClick={() => onRemove(h)} aria-label={`Remove ${h.name}`}>Remove</Button>
                  </Can>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Blackouts />
      </div>

      <div className="min-w-0 space-y-4">
        <Can perm="hrms.holiday.manage">
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold">Add holiday</h2>
            <form onSubmit={add} className="space-y-3">
              <Field label="Date">
                <Input type="date" value={form.holiday_date} required onChange={(e) => setForm({ ...form, holiday_date: e.target.value })} />
              </Field>
              <Field label="Name">
                <Input value={form.name} required placeholder="e.g. Eid-ul-Fitr" onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Kind">
                <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  <option value="public">Public holiday (everyone off)</option>
                  <option value="optional">Optional (staff take it as leave)</option>
                  <option value="company">Company holiday</option>
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
                <input type="checkbox" checked={form.half_day} onChange={(e) => setForm({ ...form, half_day: e.target.checked })} /> Half day
              </label>
              {clash && (
                <p className="text-xs text-warning">
                  {fmtDate(clash.holiday_date)} is already “{clash.name}”. Saving renames it.
                </p>
              )}
              <Button type="submit" disabled={create.busy || !calendarId} className="w-full">
                {create.busy ? "Adding…" : clash ? "Rename holiday" : "Add holiday"}
              </Button>
            </form>
          </Card>
          <ImportCard calendarId={calendarId} onDone={() => { load(); loadCalendars(); }} />
        </Can>
        <Can perm="hrms.settings.manage">
          <NewCalendar onCreated={(c) => { loadCalendars(); setCalendarId(c.id); }} />
        </Can>
      </div>
    </div>
  );
}

function scopeHint(c: HolidayCalendar): string {
  if (c.scope === "federal") return "Applies to everyone.";
  if (c.scope === "province" && c.province) return `Applies to staff whose work location is in ${PROVINCE_NAMES[c.province]}.`;
  return "Your own days off, for everyone.";
}

/* Paste the CSV (or pick a file). Rows already in the calendar are skipped,
   never renamed; bad rows are listed and the rest still import. */
function ImportCard({ calendarId, onDone }: { calendarId: string; onDone: () => void }) {
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const run = useAction(
    () => api<ImportResult>(`/hrms/holidays/import?calendar_id=${calendarId}`, {
      method: "POST", body: csv, headers: { "Content-Type": "text/csv" },
    }),
    { success: (r) => `Imported ${(r as ImportResult).created} holiday(s)`, failure: "Couldn't import that list" },
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await run.run();
    if (r === undefined) return;
    setResult(r);
    if (!r.errors.length) setCsv("");
    onDone();
  }
  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Import a list</h2>
        <a
          className="text-xs text-brand hover:underline"
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
          download="holidays-template.csv"
        >
          Template
        </a>
      </div>
      <p className="text-xs text-fg-muted">
        Columns: Date, Name, and optionally Kind (public, optional, company) and Half day (yes/no). Dates like 2026-03-23 or 23/03/2026.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Field label="CSV">
          <Textarea rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={TEMPLATE} className="font-mono text-xs" />
        </Field>
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="Choose a CSV file"
          className="block w-full text-xs"
          onChange={async (e) => { const file = e.target.files?.[0]; if (file) setCsv(await file.text()); }}
        />
        <Button type="submit" variant="subtle" disabled={run.busy || !csv.trim() || !calendarId} className="w-full">
          {run.busy ? "Importing…" : "Import into this calendar"}
        </Button>
      </form>
      {result && (
        <div role="status" className="space-y-1 text-xs">
          <p>{result.created} added · {result.skipped_duplicates} already there</p>
          {result.errors.map((e) => <p key={e.row} className="text-danger">Line {e.row}: {e.error}</p>)}
        </div>
      )}
    </Card>
  );
}

function NewCalendar({ onCreated }: { onCreated: (c: HolidayCalendar) => void }) {
  const [f, setF] = useState<{ name: string; scope: "province" | "company"; province: Province }>({ name: "", scope: "province", province: "PB" });
  const create = useAction(
    () => api<HolidayCalendar>("/hrms/holiday-calendars", {
      method: "POST",
      body: JSON.stringify({ name: f.name, scope: f.scope, province: f.scope === "province" ? f.province : null }),
    }),
    { success: "Calendar added", failure: "Couldn't add the calendar" },
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = await create.run();
    if (c === undefined) return;
    setF({ ...f, name: "" });
    onCreated(c);
  }
  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold">New calendar</h2>
      <form onSubmit={submit} className="space-y-3">
        <Field label="For">
          <Select value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value as "province" | "company" })}>
            <option value="province">A province</option>
            <option value="company">The company</option>
          </Select>
        </Field>
        {f.scope === "province" && (
          <Field label="Province">
            <Select value={f.province} onChange={(e) => setF({ ...f, province: e.target.value as Province, name: f.name || PROVINCE_NAMES[e.target.value as Province] })}>
              {PROVINCES.map((p) => <option key={p} value={p}>{PROVINCE_NAMES[p]}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Name"><Input value={f.name} required placeholder={f.scope === "province" ? PROVINCE_NAMES[f.province] : "Company days"} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Button type="submit" variant="subtle" disabled={create.busy || !f.name.trim()} className="w-full">{create.busy ? "Adding…" : "Add calendar"}</Button>
      </form>
    </Card>
  );
}

/* Days no one may take leave (an Eid sale week, a stock take). */
function Blackouts() {
  const [rows, setRows] = useState<Blackout[]>([]);
  const [f, setF] = useState({ name: "", date_from: "", date_to: "" });
  const load = useCallback(() => { api<Blackout[]>("/hrms/blackout-days").then(setRows).catch(() => setRows([])); }, []);
  useEffect(load, [load]);
  const add = useAction(
    () => api("/hrms/blackout-days", { method: "POST", body: JSON.stringify({ ...f, date_to: f.date_to || f.date_from }) }),
    { success: "Blackout added", failure: "Couldn't add the blackout" },
  );
  const del = useAction(
    async (b: Blackout) => { await api(`/hrms/blackout-days/${b.id}`, { method: "DELETE" }); return true; },
    { success: "Blackout removed", failure: "Couldn't remove it" },
  );
  return (
    <section className="space-y-2" aria-labelledby="blackouts-h">
      <h2 id="blackouts-h" className="text-sm font-semibold">No-leave days</h2>
      <p className="text-xs text-fg-subtle">Nobody can request leave on these dates — a busy season or a stock take.</p>
      {rows.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {rows.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
              <span className="tabular-nums text-fg-muted">{fmtDate(b.date_from)}{b.date_to !== b.date_from && ` → ${fmtDate(b.date_to)}`}</span>
              <span className="min-w-0 flex-1">{b.name}</span>
              <Can perm="hrms.settings.manage">
                <Button size="sm" variant="ghost" onClick={async () => { if (await del.run(b)) load(); }} aria-label={`Remove ${b.name}`}>Remove</Button>
              </Can>
            </li>
          ))}
        </ul>
      )}
      <Can perm="hrms.settings.manage">
        <form
          className={cx("flex flex-wrap items-end gap-2")}
          onSubmit={async (e) => { e.preventDefault(); if ((await add.run()) !== undefined) { setF({ name: "", date_from: "", date_to: "" }); load(); } }}
        >
          <Field label="Name"><Input value={f.name} required placeholder="e.g. Eid sale week" onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="From"><Input type="date" value={f.date_from} required onChange={(e) => setF({ ...f, date_from: e.target.value })} /></Field>
          <Field label="To"><Input type="date" value={f.date_to} min={f.date_from || undefined} onChange={(e) => setF({ ...f, date_to: e.target.value })} /></Field>
          <Button type="submit" variant="subtle" disabled={add.busy}>{add.busy ? "Adding…" : "Add"}</Button>
        </form>
      </Can>
    </section>
  );
}
