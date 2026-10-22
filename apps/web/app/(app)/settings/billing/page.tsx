"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy } from "lucide-react";
import type { Billing, PaymentInstructions, Plan } from "@business-os/types";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { formatDate, formatNumber, money } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Badge, Button, Card, ErrorState, LoadingRows } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import { salesMailto } from "@/components/marketing/contact";

const statusTone = {
  trialing: "warning", active: "success", expired: "danger", past_due: "danger", canceled: "danger",
} as const;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function BillingPage() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The payment request outlives the dialog: closing and reopening it shows
  // the same bank details and reference instead of POSTing a new request.
  const [pay, setPay] = useState<PaymentInstructions | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [b, p] = await Promise.all([api<Billing>("/billing"), api<Plan[]>("/billing/plans")]);
      setBilling(b);
      setPlans(p);
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const upgrade = useAction(
    (planKey: string) => api<PaymentInstructions>("/billing/upgrade", { method: "POST", body: JSON.stringify({ plan: planKey }) }),
    { failure: "Couldn't start the upgrade" },
  );
  const submitPaid = useAction(
    (id: string) => api<Billing>(`/billing/payment-requests/${id}/submit`, { method: "POST" }),
    { success: "Transfer noted", failure: "Couldn't record the transfer" },
  );

  async function choose(planKey: string) {
    if (pay && pay.plan === planKey) { setPayOpen(true); return; }
    const p = await upgrade.run(planKey);
    if (p) { setPay(p); setPayOpen(true); }
  }

  async function confirmSent() {
    if (!pay) return;
    const b = await submitPaid.run(pay.payment_request_id);
    if (b) {
      setBilling(b);
      setPay(null);
      setPayOpen(false);
      setSubmitted(true);
    }
  }

  if (loadError && !billing) return <ErrorState message={`Couldn't load billing. ${loadError}`} onRetry={load} />;
  if (!billing) return <LoadingRows label="Loading billing" />;

  return (
    <div className="space-y-6">
      {/* Current plan */}
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold capitalize">{billing.plan} plan</span>
            <Badge tone={statusTone[billing.status]}>{billing.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {billing.status === "expired"
              ? "Your trial has ended — you're on Starter limits until you upgrade."
              : billing.status === "trialing"
              ? `${plural(billing.days_left ?? 0, "day")} left in your free trial`
              : billing.current_period_end
              ? `Renews ${formatDate(billing.current_period_end)}`
              : "Active"}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <Meter label="Seats" used={billing.seats_used} max={billing.max_seats} />
          <Meter label="Modules" used={billing.sections_used} max={billing.max_sections} />
        </div>
      </Card>

      {/* Plans */}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const current = p.key === billing.plan && billing.status === "active";
          const pending = pay?.plan === p.key;
          return (
            <Card key={p.key} className={p.key === "growth" ? "border-brand/40" : ""}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{p.name}</h3>
                {p.key === "growth" && <Badge tone="brand">Popular</Badge>}
              </div>
              <p className="mt-2 text-2xl font-semibold">
                {p.price_minor ? money(p.price_minor) : "Custom"}
                {p.price_minor > 0 && <span className="text-sm font-normal text-fg-subtle"> /mo</span>}
              </p>
              <ul className="mt-4 space-y-1.5 text-sm text-fg-muted">
                <li>✓ {p.max_sections === 3 ? "All 3 modules" : plural(p.max_sections, "module")}</li>
                <li>✓ {p.max_seats >= 100000 ? "Unlimited" : p.max_seats} users</li>
                <li>✓ {p.ai_monthly >= 100000 ? "Custom" : formatNumber(p.ai_monthly)} AI queries/mo</li>
              </ul>
              <div className="mt-5">
                {current ? (
                  <Button variant="subtle" disabled className="w-full">Current plan</Button>
                ) : p.key === "enterprise" ? (
                  // A real way to reach us; this used to be a button that did nothing.
                  <a
                    href={salesMailto(`Business OS Enterprise — ${billing.plan} plan customer`)}
                    className="inline-flex w-full items-center justify-center rounded-lg border border-line bg-elevated px-4 py-2 text-sm font-medium text-fg transition-colors hover:border-line-strong pointer-coarse:min-h-11"
                  >
                    Contact sales
                  </a>
                ) : (
                  <Can perm="settings.billing.manage" fallback={<p className="text-center text-xs text-fg-subtle">The owner changes the plan.</p>}>
                    <Button onClick={() => choose(p.key)} disabled={upgrade.busy} className="w-full">
                      {pending ? "Show transfer details" : `Choose ${p.name}`}
                    </Button>
                  </Can>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {submitted && (
        <Card className="border-brand/40 bg-brand-subtle/20">
          <p className="text-sm font-medium">Transfer noted — thank you.</p>
          <p className="mt-1 text-sm text-fg-muted">
            We&apos;ll match it against your reference and activate the plan, usually within one business day.
            Nothing changes on your account until the money clears.
          </p>
        </Card>
      )}

      {pay && (
        <PayModal
          pay={pay}
          open={payOpen}
          onOpenChange={setPayOpen}
          busy={submitPaid.busy}
          onSubmit={confirmSent}
        />
      )}
    </div>
  );
}

function Meter({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = Math.min(100, max >= 100000 ? 5 : (used / max) * 100);
  return (
    <div className="w-28">
      <div className="flex justify-between text-xs text-fg-subtle">
        <span>{label}</span>
        <span>{used}/{max >= 100000 ? "∞" : max}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-elevated" role="meter" aria-label={label}
           aria-valuemin={0} aria-valuemax={max} aria-valuenow={used}>
        <div className="h-1.5 rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PayModal({ pay, open, onOpenChange, busy, onSubmit }: {
  pay: PaymentInstructions; open: boolean; onOpenChange: (o: boolean) => void; busy: boolean; onSubmit: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={`Bank transfer — ${money(pay.amount_minor)}`}
      description={pay.bank.note}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Not yet</Button>
          <Button onClick={onSubmit} disabled={busy}>{busy ? "Sending…" : "I've sent the transfer"}</Button>
        </>
      }
    >
      <dl className="space-y-2.5 rounded-lg border border-line bg-canvas p-3 text-sm">
        <Row k="Bank" v={pay.bank.bank} />
        <Row k="Title" v={pay.bank.title} copy />
        <Row k="Account" v={pay.bank.account} copy mono />
        <Row k="Reference" v={pay.reference} copy mono accent />
      </dl>
      <p className="mt-3 text-xs text-fg-subtle">
        Include the reference so we can match your transfer. We activate once it clears —
        usually within one business day. You can close this and come back; the details stay the same.
      </p>
    </Dialog>
  );
}

/** Account numbers and IBANs are long and unbroken: they wrap anywhere rather
 *  than pushing the dialog wider than a phone, and they copy in one tap so
 *  nobody retypes 24 characters into a banking app. */
function Row({ k, v, copy = false, mono = false, accent = false }:
             { k: string; v: string; copy?: boolean; mono?: boolean; accent?: boolean }) {
  const toast = useToast();
  async function doCopy() {
    try {
      await navigator.clipboard.writeText(v);
      toast.success(`${k} copied`);
    } catch {
      toast.error(`Couldn't copy the ${k.toLowerCase()} — select it and copy it instead.`);
    }
  }
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 pt-0.5 text-fg-subtle">{k}</dt>
      <dd className="flex min-w-0 items-start gap-1.5 text-right">
        <span className={`min-w-0 break-all pt-0.5 font-medium ${mono ? "font-mono text-[13px]" : ""} ${accent ? "text-brand" : ""}`}>{v}</span>
        {copy && (
          <button
            type="button"
            onClick={doCopy}
            aria-label={`Copy ${k.toLowerCase()}`}
            title={`Copy ${k.toLowerCase()}`}
            className="-my-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-subtle hover:bg-elevated hover:text-fg pointer-coarse:h-11 pointer-coarse:w-11"
          >
            <Copy size={14} aria-hidden />
          </button>
        )}
      </dd>
    </div>
  );
}
