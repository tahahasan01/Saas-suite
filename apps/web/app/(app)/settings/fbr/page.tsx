"use client";

import { useCallback, useEffect, useState } from "react";
import type { FbrInvoice, FbrSettings } from "@business-os/types";
import { api, ApiError } from "@/lib/api";
import { relativeDate } from "@/lib/format";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

const PROVINCES = ["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory",
                   "Gilgit-Baltistan", "Azad Jammu and Kashmir"];

export default function FbrSettingsPage() {
  const [cfg, setCfg] = useState<FbrSettings | null>(null);
  const [invoices, setInvoices] = useState<FbrInvoice[]>([]);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    api<FbrSettings>("/fbr/settings").then(setCfg).catch(() => setCfg(null));
    api<FbrInvoice[]>("/fbr/invoices?pending_only=true").then(setInvoices).catch(() => setInvoices([]));
  }, []);
  useEffect(load, [load]);

  async function save(patch: Partial<FbrSettings> & { token?: string }) {
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      setCfg(await api<FbrSettings>("/fbr/settings", { method: "PUT", body: JSON.stringify(patch) }));
      setToken("");
      setSaved(true);
      load();
    } catch (e) {
      setErr(e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  if (!cfg) return <p className="text-sm text-fg-subtle">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-5">
      <header>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">FBR Digital Invoicing</h2>
          <Badge tone={cfg.enabled ? "success" : "neutral"}>{cfg.enabled ? "On" : "Off"}</Badge>
          {cfg.enabled && <Badge tone={cfg.environment === "production" ? "brand" : "warning"}>{cfg.environment}</Badge>}
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          Tier-1 retailers must transmit every sale to FBR in real time and print the invoice number
          and QR on the receipt. Selling stays available even if FBR is unreachable — anything that
          doesn&apos;t go through is filed automatically once it&apos;s back.
        </p>
      </header>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">Seller details</h3>
        <p className="text-xs text-fg-subtle">These must match your FBR registration exactly.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="NTN or CNIC">
            <Input defaultValue={cfg.seller_ntn_cnic} placeholder="7 or 13 digits"
                   onBlur={(e) => e.target.value !== cfg.seller_ntn_cnic && save({ seller_ntn_cnic: e.target.value })} />
          </Field>
          <Field label="Business name">
            <Input defaultValue={cfg.seller_business_name}
                   onBlur={(e) => e.target.value !== cfg.seller_business_name && save({ seller_business_name: e.target.value })} />
          </Field>
          <Field label="Province">
            <Select defaultValue={cfg.seller_province} onChange={(e) => save({ seller_province: e.target.value })}>
              <option value="">Select…</option>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Address">
            <Input defaultValue={cfg.seller_address}
                   onBlur={(e) => e.target.value !== cfg.seller_address && save({ seller_address: e.target.value })} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">API token</h3>
        <p className="text-xs text-fg-subtle">
          Generate this at e.fbr.gov.pk. It&apos;s valid for 5 years. We store it and never show it again.
        </p>
        <div className="flex gap-2">
          <Input type="password" value={token} onChange={(e) => setToken(e.target.value)}
                 placeholder={cfg.token_set ? "A token is saved — paste a new one to replace it" : "Paste your FBR token"} />
          <Button disabled={busy || !token} onClick={() => save({ token })}>Save</Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">How you price</h3>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" checked={cfg.prices_include_tax} className="mt-1 accent-[var(--color-brand)]"
                 onChange={(e) => save({ prices_include_tax: e.target.checked })} />
          <span>
            Shelf prices include sales tax
            <span className="block text-xs text-fg-subtle">
              Standard for Pakistani retail. FBR is sent the value excluding tax, worked back from your price.
            </span>
          </span>
        </label>
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">Environment</h3>
        <Select value={cfg.environment} onChange={(e) => save({ environment: e.target.value as FbrSettings["environment"] })}>
          <option value="sandbox">Sandbox — test filings, nothing is official</option>
          <option value="production">Production — real filings to FBR</option>
        </Select>
        <div className="flex items-center justify-between border-t border-line pt-3">
          <div>
            <p className="text-sm font-medium">{cfg.enabled ? "Filing is on" : "Filing is off"}</p>
            <p className="text-xs text-fg-subtle">
              {cfg.enabled ? "Every sale is transmitted to FBR." : "Sales are not being reported to FBR."}
            </p>
          </div>
          <Button variant={cfg.enabled ? "subtle" : "primary"} disabled={busy}
                  onClick={() => save({ enabled: !cfg.enabled })}>
            {cfg.enabled ? "Turn off" : "Turn on"}
          </Button>
        </div>
        {err && <p className="text-xs text-danger">{err}</p>}
        {saved && !err && <p className="text-xs text-success">Saved.</p>}
      </Card>

      {invoices.length > 0 && (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold">Not yet filed ({invoices.length})</h3>
          <p className="text-xs text-fg-subtle">These retry automatically every couple of minutes.</p>
          <ul className="divide-y divide-line">
            {invoices.map((i) => (
              <li key={i.sale_id} className="py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-fg-muted">{i.sale_id.slice(0, 8)}</span>
                  <span className="text-fg-subtle">{relativeDate(i.created_at)} · {i.attempts} tries</span>
                </div>
                <p className="mt-0.5 text-danger">{i.error_code && `[${i.error_code}] `}{i.error}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
