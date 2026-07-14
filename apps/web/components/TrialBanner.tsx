"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Billing } from "@business-os/types";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

export function TrialBanner() {
  const { me } = useSession();
  const [billing, setBilling] = useState<Billing | null>(null);
  // Billing is the owner's concern — an employee login must never see an
  // "Upgrade" nudge (and the /billing call would be noise on their session).
  const isEmployee = me?.employee_portal;

  useEffect(() => {
    if (isEmployee) return;
    api<Billing>("/billing").then(setBilling).catch(() => {});
  }, [isEmployee]);

  if (isEmployee || !billing || billing.status !== "trialing") return null;
  const days = billing.days_left ?? 0;
  const urgent = days <= 3;

  return (
    <div className={`flex items-center justify-center gap-3 px-4 py-2 text-xs ${urgent ? "bg-danger/15 text-danger" : "bg-brand-subtle text-brand"}`}>
      <span>
        {days > 0 ? `${days} day${days === 1 ? "" : "s"} left in your free trial` : "Your trial has ended"}
      </span>
      <Link href="/settings/billing" className="font-semibold underline underline-offset-2">Upgrade</Link>
    </div>
  );
}
