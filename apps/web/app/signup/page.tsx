"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  INDUSTRIES,
  INDUSTRY_LABELS,
  SECTIONS,
  SECTION_LABELS,
  type Industry,
  type Section,
  type TerminologyResponse,
} from "@business-os/types";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button, Card, Field, Input, PasswordInput, Select } from "@/components/ui";
import { AuthShell } from "@/components/AuthShell";

export default function SignupPage() {
  const router = useRouter();
  const { refresh } = useSession();
  const [form, setForm] = useState({ company_name: "", name: "", email: "", password: "" });
  const [industry, setIndustry] = useState<Industry>("retail");
  const [sections, setSections] = useState<Section[]>(["crm"]);
  const [sampleData, setSampleData] = useState(true);
  const [preview, setPreview] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Live preview of how the UI re-skins for the chosen industry.
  useEffect(() => {
    api<TerminologyResponse>(`/terminology/preview/${industry}`)
      .then((r) => setPreview(r.labels))
      .catch(() => setPreview({}));
  }, [industry]);

  const toggle = (s: Section) =>
    setSections((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ ...form, industry_type: industry, sections, sample_data: sampleData }),
      });
      await refresh();
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell eyebrow="Create account" width="lg">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="space-y-4">
        <h1 className="text-lg font-semibold">Create your workspace</h1>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Company name">
            <Input name="organization" autoComplete="organization" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} required />
          </Field>
          <Field label="Industry">
            <Select value={industry} onChange={(e) => setIndustry(e.target.value as Industry)}>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>{INDUSTRY_LABELS[i]}</option>
              ))}
            </Select>
          </Field>
          <div role="group" aria-labelledby="sections-label" className="space-y-1">
            <span id="sections-label" className="text-xs font-medium text-fg-muted">Enable sections</span>
            <div className="flex flex-wrap gap-2">
              {/* Toggle buttons: aria-pressed says which are on, not just the colour. */}
              {SECTIONS.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => toggle(s)}
                  aria-pressed={sections.includes(s)}
                  className={`rounded-md border px-3 py-1 text-sm pointer-coarse:min-h-11 ${
                    sections.includes(s)
                      ? "border-brand bg-brand-subtle text-brand"
                      : "border-line text-fg-muted"
                  }`}
                >
                  {SECTION_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
            <input type="checkbox" checked={sampleData} onChange={(e) => setSampleData(e.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--color-brand)]" />
            Start with sample data (so you can explore right away)
          </label>
          <Field label="Your name">
            <Input name="name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Email">
            <Input type="email" name="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label="Password (min 8 chars)">
            <PasswordInput name="new-password" autoComplete="new-password" minLength={8}
                           value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </Field>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={busy || sections.length === 0} className="w-full">
            {busy ? "Creating…" : "Create workspace"}
          </Button>
        </form>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-fg">Live preview — your interface will say:</h2>
        <ul className="space-y-2 text-sm">
          {["lead", "product", "deal", "fulfillment"].map((k) => (
            <li key={k} className="flex justify-between border-b border-line pb-1">
              <span className="text-fg-subtle">{k}</span>
              <span className="font-medium">{preview[k] ?? "…"}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-fg-subtle">Same system — the words change to fit your industry.</p>
      </Card>
      </div>
    </AuthShell>
  );
}
