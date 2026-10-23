"use client";

import { use, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { apiUrl } from "@/lib/api";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";

/* A business's web form (wave D): customers leave their details and become a
   lead. No login. The page sends only what it shows, plus the ticket it was
   given and the link's UTM tags; where the lead goes is decided on the
   server. The "website" field is a trap for bots: people never see it. */

type Form = Schema<"WebFormPublic">;
type Values = Record<string, string>;

const LABELS: Record<string, { label: string; type?: string; auto?: string }> = {
  phone: { label: "Phone", type: "tel", auto: "tel" },
  email: { label: "Email", type: "email", auto: "email" },
  company: { label: "Company", auto: "organization" },
  city: { label: "City", auto: "address-level2" },
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init, headers: { "Content-Type": "application/json" }, credentials: "omit", cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.detail === "string" ? body.detail : "Something went wrong. Try again.");
  return body as T;
}

export default function WebFormPage({ params, searchParams }: {
  params: Promise<{ publicId: string }>; searchParams: Promise<{ embed?: string }>;
}) {
  const { publicId } = use(params);
  // ?embed=1: inside an iframe on the business's site, so no full-screen frame around it.
  const embedded = use(searchParams).embed === "1";
  const path = `/public/forms/${encodeURIComponent(publicId)}`;
  const [form, setForm] = useState<Form | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [values, setValues] = useState<Values>({ name: "", website: "" });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => { call<Form>(path).then(setForm).catch((e: Error) => setFatal(e.message)); }, [path]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || busy) return;
    setBusy(true);
    setError(null);
    const utm = Object.fromEntries(["utm_source", "utm_medium", "utm_campaign"]
      .map((k) => [k, new URLSearchParams(window.location.search).get(k) ?? ""]));
    try {
      const r = await call<{ message: string }>(path, {
        method: "POST", body: JSON.stringify({ ticket: form.ticket, values: { ...values, ...utm, consent } }),
      });
      setDone(r.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues({ ...values, [k]: e.target.value });

  return (
    <main className={embedded ? "p-2 text-fg" : "grid min-h-dvh place-items-center bg-canvas px-4 py-8 text-fg"}>
      <div className="w-full max-w-md">
        <Card>
          <div className="space-y-4 p-6">
            {fatal ? <p className="text-center">{fatal}</p> : !form ? (
              <p className="text-center text-fg-muted" role="status">Loading…</p>
            ) : done ? (
              <p className="text-center text-lg" role="status">{done}</p>
            ) : (
              <>
                <header>
                  <p className="text-xs text-fg-muted">{form.business_name}</p>
                  <h1 className="font-display text-xl font-semibold">{form.title}</h1>
                  {form.intro && <p className="mt-1 whitespace-pre-line text-sm text-fg-muted">{form.intro}</p>}
                </header>
                <form className="space-y-3" onSubmit={submit}>
                  <Field label="Your name">
                    <Input required maxLength={120} autoComplete="name" value={values.name} onChange={set("name")} />
                  </Field>
                  {form.fields.filter((k) => k !== "message").map((k) => (
                    <Field key={k} label={LABELS[k].label}>
                      <Input type={LABELS[k].type ?? "text"} autoComplete={LABELS[k].auto} maxLength={200}
                             value={values[k] ?? ""} onChange={set(k)} />
                    </Field>
                  ))}
                  {form.fields.includes("message") && (
                    <Field label="Message">
                      <Textarea rows={4} maxLength={2000} value={values.message ?? ""} onChange={set("message")} />
                    </Field>
                  )}
                  {form.consent_label && (
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                      <span>{form.consent_label}</span>
                    </label>
                  )}
                  {/* Bots fill every field; people never see this one. */}
                  <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
                    <label>Website<input tabIndex={-1} autoComplete="off" value={values.website} onChange={set("website")} /></label>
                  </div>
                  {error && <p className="text-sm text-danger" role="alert">{error}</p>}
                  <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send"}</Button>
                </form>
              </>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
