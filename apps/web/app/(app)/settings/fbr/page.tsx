"use client";

import { useCallback, useEffect, useState } from "react";
import type { FbrInvoice, FbrSettings } from "@business-os/types";
import { api } from "@/lib/api";
import { relativeDate } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Badge, Button, Card, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";
import { useConfirm } from "@/components/Confirm";

const PROVINCES = ["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory",
                   "Gilgit-Baltistan", "Azad Jammu and Kashmir"];

type Patch = Partial<FbrSettings> & { token?: string };

export default function FbrSettingsPage() {
  const [cfg, setCfg] = useState<FbrSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<FbrInvoice[]>([]);
  // An empty "not yet filed" list must mean nothing is pending, never "we couldn't ask".
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const confirm = useConfirm();

  const loadInvoices = useCallback(() => {
    setInvoicesError(null);
    api<FbrInvoice[]>("/fbr/invoices?pending_only=true")
      .then(setInvoices)
      .catch((e) => setInvoicesError(errorText(e, "Couldn't check for invoices FBR hasn't accepted yet.")));
  }, []);
  const load = useCallback(async () => {
    setLoadError(null);
    loadInvoices();
    try {
      setCfg(await api<FbrSettings>("/fbr/settings"));
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, [loadInvoices]);
  useEffect(() => { load(); }, [load]);

  const put = useCallback(async (patch: Patch) => {
    const next = await api<FbrSettings>("/fbr/settings", { method: "PUT", body: JSON.stringify(patch) });
    setCfg(next);
    loadInvoices();
    return next;
  }, [loadInvoices]);

  // Whole-setting changes (token, pricing, environment, on/off) say so in a toast.
  const save = useAction(put, { success: "FBR settings saved", failure: "Couldn't save FBR settings" });

  if (!cfg) {
    return loadError
      ? <ErrorState message={`Couldn't load FBR settings. ${loadError}`} onRetry={load} />
      : <LoadingRows label="Loading FBR settings" />;
  }

  async function saveToken() {
    if (await save.run({ token })) setToken("");
  }

  // Production is never one slip away: picking it asks first, and the select
  // stays on Sandbox (it shows cfg, which only changes once the save lands).
  function askProduction(c: FbrSettings) {
    void confirm({
      title: "Switch to Production?",
      body: (
        <div className="space-y-2">
          <p className="text-fg">
            This sends real invoices to FBR. {c.enabled ? "From your next sale" : "Once filing is on"}, every
            sale is filed officially under {c.seller_ntn_cnic ? <span className="font-medium">{c.seller_ntn_cnic}</span> : "your NTN"} and
            can&apos;t be taken back.
          </p>
          <p>Stay on Sandbox until your test filings go through cleanly.</p>
        </div>
      ),
      confirmLabel: "Switch to Production",
      busyLabel: "Switching…",
      tone: "danger",
      run: () => save.run({ environment: "production" }),
    });
  }

  return (
    <div className="max-w-2xl space-y-5">
      <header>
        <div className="flex flex-wrap items-center gap-2">
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
        <p className="text-xs text-fg-subtle">These must match your FBR registration exactly. Each field saves when you leave it.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <SellerField label="NTN or CNIC" value={cfg.seller_ntn_cnic} placeholder="7 or 13 digits" inputMode="numeric"
                       onSave={(v) => put({ seller_ntn_cnic: v })} />
          <SellerField label="Business name" value={cfg.seller_business_name}
                       onSave={(v) => put({ seller_business_name: v })} />
          <SellerField label="Province" value={cfg.seller_province} options={PROVINCES}
                       onSave={(v) => put({ seller_province: v })} />
          <SellerField label="Address" value={cfg.seller_address}
                       onSave={(v) => put({ seller_address: v })} />
        </div>
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">API token</h3>
        <p className="text-xs text-fg-subtle">
          Generate this at e.fbr.gov.pk. It&apos;s valid for 5 years. We store it and never show it again.
        </p>
        <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); saveToken(); }}>
          <div className="min-w-0 flex-1">
            <Field label="FBR API token">
              <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off"
                     placeholder={cfg.token_set ? "A token is saved — paste a new one to replace it" : "Paste your FBR token"} />
            </Field>
          </div>
          <Button type="submit" disabled={save.busy || !token}>Save token</Button>
        </form>
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">How you price</h3>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" checked={cfg.prices_include_tax} disabled={save.busy}
                 className="mt-1 h-4 w-4 accent-[var(--color-brand)]"
                 onChange={(e) => save.run({ prices_include_tax: e.target.checked })} />
          <span>
            Shelf prices include sales tax
            <span className="block text-xs text-fg-subtle">
              Standard for Pakistani retail. FBR is sent the value excluding tax, worked back from your price.
            </span>
          </span>
        </label>
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">Where filings go</h3>
        <Field label="Environment">
          <Select
            value={cfg.environment}
            disabled={save.busy}
            onChange={(e) => {
              const env = e.target.value as FbrSettings["environment"];
              if (env === "production") askProduction(cfg);
              else save.run({ environment: env });
            }}
          >
            <option value="sandbox">Sandbox — test filings, nothing is official</option>
            <option value="production">Production — real filings to FBR</option>
          </Select>
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <div>
            <p className="text-sm font-medium">{cfg.enabled ? "Filing is on" : "Filing is off"}</p>
            <p className="text-xs text-fg-subtle">
              {cfg.enabled ? "Every sale is transmitted to FBR." : "Sales are not being reported to FBR."}
            </p>
          </div>
          <Button variant={cfg.enabled ? "subtle" : "primary"} disabled={save.busy}
                  onClick={() => save.run({ enabled: !cfg.enabled })}>
            {cfg.enabled ? "Turn off" : "Turn on"}
          </Button>
        </div>
        {save.error && <p role="alert" className="text-xs text-danger">{save.error}</p>}
      </Card>

      {invoicesError && <ErrorState message={invoicesError} onRetry={loadInvoices} />}
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
                <p className="mt-0.5 break-words text-danger">{i.error_code && `[${i.error_code}] `}{i.error}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** One seller field that saves itself on blur and says what happened right
 *  under it — before, a failed save of the NTN looked exactly like a good one. */
function SellerField({ label, value, onSave, options, placeholder, inputMode }: {
  label: string;
  value: string;
  onSave: (v: string) => Promise<unknown>;
  options?: string[];
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const act = useAction(onSave, { failure: `Couldn't save ${label}` });
  useEffect(() => setDraft(value), [value]);

  async function commit(v: string) {
    if (v === value) return;
    setSaved(false);
    if (await act.run(v)) setSaved(true);
  }

  const status = act.busy ? (
    <span className="text-fg-subtle">Saving…</span>
  ) : act.error ? (
    <span className="text-danger">{act.error}</span>
  ) : saved ? (
    <span className="text-success">Saved</span>
  ) : null;

  return (
    <div className="min-w-0">
      <Field label={label}>
        {options ? (
          <Select value={draft} disabled={act.busy} onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}>
            <option value="">Select…</option>
            {options.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        ) : (
          <Input value={draft} placeholder={placeholder} inputMode={inputMode} aria-invalid={act.error ? true : undefined}
                 onChange={(e) => { setDraft(e.target.value); setSaved(false); act.clearError(); }}
                 onBlur={(e) => commit(e.target.value)} />
        )}
      </Field>
      <p aria-live="polite" className="mt-1 min-h-4 text-xs">{status}</p>
    </div>
  );
}
