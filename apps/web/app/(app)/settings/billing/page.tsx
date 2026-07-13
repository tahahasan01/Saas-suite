"use client";

import { useCallback, useEffect, useState } from "react";
import type { Billing, PaymentInstructions, Plan } from "@business-os/types";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { Badge, Button, Card } from "@/components/ui";

const statusTone = { trialing: "warning", active: "success", past_due: "danger", canceled: "danger" } as const;

export default function BillingPage() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [pay, setPay] = useState<PaymentInstructions | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Billing>("/billing").then(setBilling).catch(() => {});
    api<Plan[]>("/billing/plans").then(setPlans).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function upgrade(planKey: string) {
    setBusy(true);
    try {
      setPay(await api<PaymentInstructions>("/billing/upgrade", { method: "POST", body: JSON.stringify({ plan: planKey }) }));
    } finally {
      setBusy(false);
    }
  }
  async function confirmPaid() {
    if (!pay) return;
    setBusy(true);
    try {
      await api(`/billing/payment-requests/${pay.payment_request_id}/confirm`, { method: "POST" });
      setPay(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!billing) return <p className="text-sm text-fg-subtle">Loading…</p>;

  return (
    <div className="space-y-6">
      {/* Current plan */}
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold capitalize">{billing.plan} plan</span>
            <Badge tone={statusTone[billing.status]}>{billing.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {billing.status === "trialing"
              ? `${billing.days_left ?? 0} days left in your free trial`
              : billing.current_period_end
              ? `Renews ${new Date(billing.current_period_end).toLocaleDateString("en-PK")}`
              : "Active"}
          </p>
        </div>
        <div className="flex gap-8">
          <Meter label="Seats" used={billing.seats_used} max={billing.max_seats} />
          <Meter label="Modules" used={billing.sections_used} max={billing.max_sections} />
        </div>
      </Card>

      {/* Plans */}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const current = p.key === billing.plan && billing.status === "active";
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
                <li>✓ {p.max_sections === 3 ? "All 3 modules" : `${p.max_sections} module`}</li>
                <li>✓ {p.max_seats >= 100000 ? "Unlimited" : p.max_seats} users</li>
                <li>✓ {p.ai_monthly >= 100000 ? "Custom" : p.ai_monthly.toLocaleString()} AI queries/mo</li>
              </ul>
              <div className="mt-5">
                {current ? (
                  <Button variant="subtle" disabled className="w-full">Current plan</Button>
                ) : p.key === "enterprise" ? (
                  <Button variant="subtle" className="w-full">Contact sales</Button>
                ) : (
                  <Button onClick={() => upgrade(p.key)} disabled={busy} className="w-full">Choose {p.name}</Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {pay && <PayModal pay={pay} busy={busy} onClose={() => setPay(null)} onConfirm={confirmPaid} />}
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
      <div className="mt-1 h-1.5 rounded-full bg-elevated">
        <div className="h-1.5 rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PayModal({ pay, busy, onClose, onConfirm }: { pay: PaymentInstructions; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <Card className="w-full max-w-sm space-y-3" >
        <div onClick={(e) => e.stopPropagation()} className="space-y-3">
          <h2 className="text-base font-semibold">Bank transfer — {money(pay.amount_minor)}</h2>
          <p className="text-sm text-fg-muted">{pay.bank.note}</p>
          <div className="space-y-1.5 rounded-lg border border-line bg-canvas p-3 text-sm">
            <Row k="Bank" v={pay.bank.bank} />
            <Row k="Title" v={pay.bank.title} />
            <Row k="Account" v={pay.bank.account} />
            <Row k="Reference" v={pay.reference} accent />
          </div>
          <p className="text-xs text-fg-subtle">
            After transferring, click below to activate. (We verify transfers before activation in production.)
          </p>
          <div className="flex gap-2">
            <Button onClick={onConfirm} disabled={busy} className="flex-1">{busy ? "Activating…" : "I've paid — activate"}</Button>
            <button onClick={onClose} className="rounded-lg px-3 text-sm text-fg-muted">Cancel</button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Row({ k, v, accent = false }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-fg-subtle">{k}</span>
      <span className={`font-medium ${accent ? "text-brand" : ""}`}>{v}</span>
    </div>
  );
}
