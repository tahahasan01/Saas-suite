"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CrmSummary } from "@business-os/types";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Card } from "@/components/ui";
import { AiPrompt } from "@/components/AiPrompt";

export default function Dashboard() {
  const { me, t } = useSession();
  const [crm, setCrm] = useState<CrmSummary | null>(null);
  const hasCrm = !!me?.entitlements.find((e) => e.section_key === "crm" && e.enabled);

  useEffect(() => {
    if (hasCrm) api<CrmSummary>("/crm/summary").then(setCrm).catch(() => setCrm(null));
  }, [hasCrm]);

  if (!me) return null;
  const firstName = me.user.name.split(" ")[0];
  const isNew = hasCrm && crm !== null && crm.total_leads === 0;

  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Good to see you, {firstName}</h1>
      <p className="mb-6 text-sm text-fg-muted">Here&apos;s what&apos;s happening in {me.tenant.name}.</p>

      <AiPrompt />

      {isNew ? (
        <GetStarted leadWord={t("lead")} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {hasCrm && crm && (
            <>
              <Stat label={`Total ${t("leads")}`} value={String(crm.total_leads)} />
              <Stat label="Open" value={String(crm.open_leads)} />
              <Stat label="Won value" value={money(crm.won_value_minor)} accent />
              <Stat label="Added this week" value={`+${crm.added_this_week}`} />
            </>
          )}
          {!hasCrm && <p className="text-sm text-fg-subtle">Enable a section in Settings to get started.</p>}
        </div>
      )}
    </>
  );
}

function GetStarted({ leadWord }: { leadWord: string }) {
  const steps = [
    { label: `Add your first ${leadWord}`, href: "/crm", cta: "Add now" },
    { label: "Invite your team", href: "/settings/team", cta: "Invite" },
    { label: "Turn on WhatsApp", href: "/settings/sections", cta: "Connect" },
  ];
  return (
    <Card>
      <h2 className="text-base font-semibold">Get started in 3 steps</h2>
      <p className="mb-4 text-sm text-fg-muted">Set up takes about 2 minutes. No manual required.</p>
      <ul className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
            <span className="flex items-center gap-3">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-elevated text-xs font-semibold text-fg-muted">{i + 1}</span>
              <span className="text-sm">{s.label}</span>
            </span>
            <Link href={s.href} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-fg hover:bg-brand-hover">
              {s.cta}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <p className="text-xs text-fg-subtle">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ? "text-brand" : ""}`}>{value}</p>
    </Card>
  );
}
