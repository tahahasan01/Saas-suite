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
import { Button, Card, Field, Input, Wordmark } from "@/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const { refresh } = useSession();
  const [form, setForm] = useState({ company_name: "", name: "", email: "", password: "" });
  const [industry, setIndustry] = useState<Industry>("retail");
  const [sections, setSections] = useState<Section[]>(["crm"]);
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
        body: JSON.stringify({ ...form, industry_type: industry, sections }),
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
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-6"><Wordmark /></div>
      <div className="grid gap-6 md:grid-cols-2">
      <Card className="space-y-4">
        <h1 className="text-lg font-semibold">Create your workspace</h1>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Company name">
            <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} required />
          </Field>
          <Field label="Industry">
            <select
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm"
              value={industry}
              onChange={(e) => setIndustry(e.target.value as Industry)}
            >
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>{INDUSTRY_LABELS[i]}</option>
              ))}
            </select>
          </Field>
          <div className="space-y-1">
            <span className="text-xs font-medium text-fg-muted">Enable sections</span>
            <div className="flex flex-wrap gap-2">
              {SECTIONS.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => toggle(s)}
                  className={`rounded-md border px-3 py-1 text-sm ${
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
          <Field label="Your name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label="Password (min 8 chars)">
            <Input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
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
    </main>
  );
}
