"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useCan } from "@/lib/can";
import { useSession } from "@/lib/session";
import { errorText, useAction } from "@/lib/useAction";
import {
  type Branding, type BrandingPatch, type Company, type Region, type Sequence, type TaxRates,
  MONTHS, TIMEZONES, fileUrl, uploadFile,
} from "@/lib/org";
import { Badge, Button, Card, ErrorState, Field, Input, LoadingRows, Select, Textarea } from "@/components/ui";
import { BranchesCard } from "@/components/settings/BranchesCard";

export default function CompanySettingsPage() {
  const can = useCan();
  const [company, setCompany] = useState<Company | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [c, r] = await Promise.all([api<Company>("/org/company"), api<Region[]>("/org/regions")]);
      setCompany(c);
      setRegions(r);
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!company) {
    return loadError
      ? <ErrorState message={`Couldn't load your company details. ${loadError}`} onRetry={load} />
      : <LoadingRows label="Loading company details" />;
  }

  return (
    <div className="max-w-3xl space-y-5">
      <header>
        <h2 className="text-lg font-semibold">Company</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Your business details, as they appear on receipts, invoices and payslips.
        </p>
      </header>
      <CompanyForm company={company} regions={regions} canEdit={can("settings.company.manage")} onSaved={setCompany} />
      {can("settings.branches.read") && <BranchesCard canEdit={can("settings.branches.manage")} />}
      <BrandingCard canEdit={can("settings.branding.manage")} />
      {can("settings.sequences.read") && <NumbersCard canEdit={can("settings.sequences.manage")} />}
      <TaxCard regions={regions} />
    </div>
  );
}

// ── Company profile ─────────────────────────────────────────────────────────
function CompanyForm({ company, regions, canEdit, onSaved }: {
  company: Company; regions: Region[]; canEdit: boolean; onSaved: (c: Company) => void;
}) {
  const { refresh } = useSession();
  const [form, setForm] = useState(() => toForm(company));
  useEffect(() => setForm(toForm(company)), [company]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useAction(
    async () => {
      const next = await api<Company>("/org/company", {
        method: "PUT",
        body: JSON.stringify({ ...form, fy_start_month: Number(form.fy_start_month) }),
      });
      onSaved(next);
      await refresh(); // the shell shows the company name and uses its timezone
      return next;
    },
    { success: "Company details saved", failure: "Couldn't save company details" },
  );

  return (
    <Card>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.run(); }}>
        <fieldset disabled={!canEdit || save.busy} className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Company profile</legend>
          <Field label="Business name"><Input value={form.name} onChange={set("name")} required maxLength={120} /></Field>
          <Field label="Legal name (as registered)"><Input value={form.legal_name} onChange={set("legal_name")} /></Field>
          <Field label="NTN">
            <Input value={form.ntn} onChange={set("ntn")} inputMode="numeric" placeholder="1234567-8" />
          </Field>
          <Field label="STRN (sales tax registration)">
            <Input value={form.strn} onChange={set("strn")} inputMode="numeric" placeholder="13 digits" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address"><Input value={form.address} onChange={set("address")} /></Field>
          </div>
          <Field label="City"><Input value={form.city} onChange={set("city")} /></Field>
          <Field label="Province">
            <Select value={form.region_code} onChange={set("region_code")}>
              <option value="">Select…</option>
              {regions.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </Select>
          </Field>
          <Field label="Phone"><Input value={form.phone} onChange={set("phone")} inputMode="tel" /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={set("email")} /></Field>
          <Field label="Timezone">
            <Select value={form.timezone} onChange={set("timezone")}>
              {Array.from(new Set([form.timezone, ...TIMEZONES])).map((z) => <option key={z} value={z}>{z}</option>)}
            </Select>
          </Field>
          <Field label="Financial year starts in">
            <Select value={form.fy_start_month} onChange={set("fy_start_month")}>
              {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
            </Select>
          </Field>
        </fieldset>
        {save.error && <p role="alert" className="text-xs text-danger">{save.error}</p>}
        {canEdit
          ? <Button type="submit" disabled={save.busy}>{save.busy ? "Saving…" : "Save details"}</Button>
          : <p className="text-xs text-fg-subtle">Only an owner or admin can change these.</p>}
      </form>
    </Card>
  );
}

function toForm(c: Company) {
  return {
    name: c.name, legal_name: c.legal_name, ntn: c.ntn ?? "", strn: c.strn ?? "", address: c.address,
    city: c.city, phone: c.phone, email: c.email, region_code: c.region_code ?? "", timezone: c.timezone,
    fy_start_month: String(c.fy_start_month),
  };
}

// ── Branding ────────────────────────────────────────────────────────────────
const TEXTS: { key: "receipt_header" | "receipt_footer" | "invoice_header" | "invoice_footer" | "payslip_header";
  label: string; hint: string }[] = [
  { key: "receipt_header", label: "Receipt header", hint: "Top of every till receipt" },
  { key: "receipt_footer", label: "Receipt footer", hint: "e.g. your return policy, or “Shukriya!”" },
  { key: "invoice_header", label: "Invoice header", hint: "Shown above the invoice details" },
  { key: "invoice_footer", label: "Invoice footer", hint: "e.g. bank details and payment terms" },
  { key: "payslip_header", label: "Payslip header", hint: "Top of every payslip" },
];

function BrandingCard({ canEdit }: { canEdit: boolean }) {
  const [b, setB] = useState<Branding | null>(null);
  const [draft, setDraft] = useState<BrandingPatch>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const got = await api<Branding>("/org/branding");
      setB(got);
      setDraft({});
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const put = useCallback(async (patch: BrandingPatch) => {
    const next = await api<Branding>("/org/branding", { method: "PUT", body: JSON.stringify(patch) });
    setB(next);
    setDraft({});
    return next;
  }, []);
  const save = useAction(put, { success: "Branding saved", failure: "Couldn't save branding" });
  const upload = useAction(async (file: File) => {
    const f = await uploadFile(file, "logo");
    return put({ logo_file_id: f.id });
  }, { success: "Logo updated", failure: "Couldn't upload the logo" });

  if (!b) {
    return loadError ? <ErrorState message={`Couldn't load branding. ${loadError}`} onRetry={load} />
      : <LoadingRows label="Loading branding" />;
  }
  const value = <K extends keyof BrandingPatch>(k: K) => (draft[k] ?? b[k as keyof Branding]) as Branding[K & keyof Branding];
  const busy = save.busy || upload.busy;

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Branding</h3>
        <p className="text-xs text-fg-subtle">Your logo and colours on receipts, invoices and payslips.</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-elevated">
          {b.logo_file_id
            // A plain <img>: the API redirects to a short-lived signed URL, nothing for next/image to optimise.
            ? <img src={fileUrl(b.logo_file_id, b.version)} alt="Your logo" className="max-h-full max-w-full object-contain" />
            : <span className="text-xs text-fg-subtle">No logo</span>}
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                   aria-label="Choose a logo image" data-testid="logo-input"
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload.run(f); e.target.value = ""; }} />
            <Button variant="subtle" disabled={busy} onClick={() => fileInput.current?.click()}>
              {upload.busy ? "Uploading…" : b.logo_file_id ? "Change logo" : "Upload logo"}
            </Button>
            {b.logo_file_id && (
              <Button variant="subtle" disabled={busy} onClick={() => save.run({ clear_logo: true })}>Remove</Button>
            )}
          </div>
        )}
        <p className="basis-full text-xs text-fg-subtle">PNG, JPEG or WebP, up to 1 MB. A square logo prints best.</p>
      </div>

      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.run(draft); }}>
        <fieldset disabled={!canEdit || busy} className="space-y-4">
          <legend className="sr-only">Colours and document text</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <ColourField label="Main colour" value={value("primary_color") ?? b.tokens.primary}
                         onChange={(v) => setDraft((d) => ({ ...d, primary_color: v }))} />
            <ColourField label="Accent colour" value={value("accent_color") ?? b.tokens.accent}
                         onChange={(v) => setDraft((d) => ({ ...d, accent_color: v }))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {TEXTS.map((t) => (
              <Field key={t.key} label={t.label}>
                <Textarea rows={2} value={value(t.key) as string} placeholder={t.hint} maxLength={500}
                          onChange={(e) => setDraft((d) => ({ ...d, [t.key]: e.target.value }))} />
              </Field>
            ))}
            <Field label="Receipt paper">
              <Select value={String(value("receipt_width_mm"))}
                      onChange={(e) => setDraft((d) => ({ ...d, receipt_width_mm: Number(e.target.value) as 58 | 80 }))}>
                <option value="80">80 mm (standard)</option>
                <option value="58">58 mm (small printers)</option>
              </Select>
            </Field>
          </div>
        </fieldset>
        {save.error && <p role="alert" className="text-xs text-danger">{save.error}</p>}
        {canEdit && (
          <Button type="submit" disabled={busy || Object.keys(draft).length === 0}>
            {save.busy ? "Saving…" : "Save branding"}
          </Button>
        )}
      </form>
    </Card>
  );
}

function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(text) ? text : value} aria-label={`${label} picker`}
               onChange={(e) => { setText(e.target.value); onChange(e.target.value); }}
               className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-line bg-surface p-1" />
        <Input value={text} maxLength={7} aria-label={`${label} hex code`}
               onChange={(e) => { setText(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value); }} />
      </div>
    </Field>
  );
}

// ── Document numbers ────────────────────────────────────────────────────────
function NumbersCard({ canEdit }: { canEdit: boolean }) {
  const [seqs, setSeqs] = useState<Sequence[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoadError(null);
    try { setSeqs(await api<Sequence[]>("/sequences")); } catch (e) { setLoadError(errorText(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <Card className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Document numbers</h3>
        <p className="text-xs text-fg-subtle">
          Numbers run without gaps and restart each financial year. You can move the next number forward
          (for example to continue from a paper book), never back.
        </p>
      </div>
      {loadError && <ErrorState message={loadError} onRetry={load} />}
      {seqs && seqs.length === 0 && (
        <p className="text-sm text-fg-muted">Numbers appear here once you issue your first invoice or receipt.</p>
      )}
      {seqs && seqs.length > 0 && (
        <ul className="divide-y divide-line">
          {seqs.map((s) => <SequenceRow key={s.id} seq={s} canEdit={canEdit} onSaved={load} />)}
        </ul>
      )}
    </Card>
  );
}

function SequenceRow({ seq, canEdit, onSaved }: { seq: Sequence; canEdit: boolean; onSaved: () => void }) {
  const [next, setNext] = useState(String(seq.next_value));
  useEffect(() => setNext(String(seq.next_value)), [seq.next_value]);
  const save = useAction(
    async () => {
      await api(`/sequences/${seq.id}`, { method: "PATCH", body: JSON.stringify({ next_value: Number(next) }) });
      onSaved();
    },
    { success: "Next number saved", failure: "Couldn't change the next number" },
  );
  return (
    <li className="flex flex-wrap items-end justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{seq.name || seq.code}</p>
        <p className="text-xs text-fg-subtle">Next: <span className="font-mono text-fg">{seq.preview}</span> · {seq.period_key}</p>
      </div>
      {canEdit && (
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); save.run(); }}>
          <Field label="Next number">
            <Input type="number" min={seq.next_value} value={next} onChange={(e) => setNext(e.target.value)} className="w-28" />
          </Field>
          <Button type="submit" variant="subtle" disabled={save.busy || Number(next) === seq.next_value}>Set</Button>
        </form>
      )}
    </li>
  );
}

// ── Tax rates ───────────────────────────────────────────────────────────────
function TaxCard({ regions }: { regions: Region[] }) {
  const [data, setData] = useState<TaxRates | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoadError(null);
    try { setData(await api<TaxRates>("/tax/rates")); } catch (e) { setLoadError(errorText(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const regionName = (c: string | null) => (c ? regions.find((r) => r.code === c)?.name ?? c : "All of Pakistan");

  return (
    <Card className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Tax rates</h3>
        <p className="text-xs text-fg-subtle">Rates in force today. Business OS keeps these up to date for you.</p>
      </div>
      {loadError && <ErrorState message={loadError} onRetry={load} />}
      {data?.unverified_in_use && (
        <div role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="font-medium">Some rates are pending verification</p>
          <p className="text-xs text-fg-muted">
            Rates marked “unverified” haven’t been checked against the official notification yet. Confirm them with
            your tax adviser before you file.
          </p>
        </div>
      )}
      {data && (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-start text-xs text-fg-subtle">
                <th className="px-1 py-1.5 font-medium">Tax</th>
                <th className="px-1 py-1.5 font-medium">Where</th>
                <th className="px-1 py-1.5 text-end font-medium">Rate</th>
                <th className="px-1 py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.rates.map((r) => (
                <tr key={r.id}>
                  <td className="px-1 py-2">{r.name}</td>
                  <td className="px-1 py-2 text-fg-muted">{regionName(r.region_code)}</td>
                  <td className="px-1 py-2 text-end tabular-nums">{r.rate_pct}%</td>
                  <td className="px-1 py-2">
                    <Badge tone={r.verified ? "success" : "warning"}>{r.verified ? "Verified" : "Unverified"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
