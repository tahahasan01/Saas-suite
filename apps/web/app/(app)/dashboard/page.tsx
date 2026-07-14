"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DashboardOverview, Kpi, TrendPoint } from "@business-os/types";
import { api } from "@/lib/api";
import { money, moneyCompact, timeAgo } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Card } from "@/components/ui";
import { AiPrompt } from "@/components/AiPrompt";
import { AreaChart, Sparkline } from "@/components/charts";

export default function Dashboard() {
  const { me, t } = useSession();
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<DashboardOverview>("/dashboard/overview")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (!me) return null;
  const firstName = me.user.name.split(" ")[0];

  const hasSignal = !!data && data.kpis.some((k) => k.value > 0);
  // Each tile borrows the series it summarises; the rest stay bare numbers.
  const trendFor: Record<string, TrendPoint[] | undefined> = {
    rev_today: data?.revenue_trend,
    open_leads: data?.leads_trend,
  };

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Good to see you, {firstName}</h1>
        <p className="mt-1 text-sm text-fg-muted">Here&apos;s what&apos;s happening in {me.tenant.name}.</p>
      </header>

      <AiPrompt />

      {loading ? (
        <SkeletonGrid />
      ) : !data ? null : !hasSignal ? (
        <GetStarted leadWord={t("lead")} />
      ) : (
        <div className="space-y-5">
          {data.alerts.length > 0 && <AlertBand alerts={data.alerts} />}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.kpis.map((k) => (
              <StatTile key={k.key} kpi={k} trend={trendFor[k.key]} />
            ))}
          </section>

          {/* Asymmetric on purpose: the chart is the subject, the feed is context. */}
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <Card>
              {data.revenue_trend.length > 0 ? (
                <AreaChart
                  data={data.revenue_trend}
                  format={(n) => money(n)}
                  title="Revenue"
                  hint="Last 14 days"
                />
              ) : (
                <AreaChart
                  data={data.leads_trend}
                  format={(n) => `${n} ${n === 1 ? t("lead") : t("leads")}`}
                  title={`New ${t("leads")}`}
                  hint="Last 14 days"
                />
              )}
            </Card>
            <ActivityFeed items={data.activity} />
          </section>

          {/* Both series exist only when POS and CRM are on — the all-in-one view. */}
          {data.revenue_trend.length > 0 && data.leads_trend.length > 0 && (
            <Card>
              <AreaChart
                data={data.leads_trend}
                format={(n) => `${n} ${n === 1 ? t("lead") : t("leads")}`}
                title={`New ${t("leads")}`}
                hint="Last 14 days"
              />
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function StatTile({ kpi, trend }: { kpi: Kpi; trend?: TrendPoint[] }) {
  const value = kpi.kind === "money" ? moneyCompact(kpi.value) : kpi.value.toLocaleString("en-PK");
  return (
    <Link href={kpi.href} className="group">
      <Card className="h-full transition-colors group-hover:border-line-strong">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-fg-muted">{kpi.label}</p>
          {kpi.delta_pct !== null && <Delta pct={kpi.delta_pct} />}
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        {trend && <div className="mt-3"><Sparkline data={trend} /></div>}
      </Card>
    </Link>
  );
}

function Delta({ pct }: { pct: number }) {
  const up = pct >= 0;
  // Arrow + sign carry the direction; colour only reinforces it.
  return (
    <span className={`text-xs font-medium tabular-nums ${up ? "text-success" : "text-danger"}`}>
      {up ? "↑" : "↓"} {Math.abs(pct)}%
    </span>
  );
}

function AlertBand({ alerts }: { alerts: DashboardOverview["alerts"] }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {alerts.map((a) => (
        <Link
          key={a.text}
          href={a.href}
          className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm transition-colors ${
            a.tone === "danger"
              ? "border-danger/30 bg-danger/5 hover:border-danger/60"
              : "border-warning/30 bg-warning/5 hover:border-warning/60"
          }`}
        >
          <span className={`text-base ${a.tone === "danger" ? "text-danger" : "text-warning"}`} aria-hidden>
            {a.tone === "danger" ? "▲" : "●"}
          </span>
          <span className="flex-1 text-fg">{a.text}</span>
          <span className="text-fg-subtle">→</span>
        </Link>
      ))}
    </section>
  );
}

const VERBS: Record<string, string> = { create: "created", update: "updated", delete: "deleted" };

function ActivityFeed({ items }: { items: DashboardOverview["activity"] }) {
  return (
    <Card className="flex flex-col">
      <h2 className="mb-3 text-sm font-semibold">Activity</h2>
      {items.length === 0 ? (
        <p className="text-sm text-fg-subtle">Nothing yet today.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((a, i) => {
            const verb = VERBS[a.action.split(".")[1]] ?? a.action.split(".")[1];
            return (
              <li key={i} className="flex gap-2.5 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="font-medium">{a.actor ?? "System"}</span>{" "}
                    <span className="text-fg-muted">{verb} a {a.entity}</span>
                  </p>
                  <p className="text-xs text-fg-subtle">{timeAgo(a.created_at)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <Card key={i}>
          <div className="h-3 w-20 animate-pulse rounded bg-elevated" />
          <div className="mt-3 h-7 w-24 animate-pulse rounded bg-elevated" />
        </Card>
      ))}
    </div>
  );
}

function GetStarted({ leadWord }: { leadWord: string }) {
  const steps = [
    { label: `Add your first ${leadWord}`, href: "/crm", cta: "Add now" },
    { label: "Invite your team", href: "/settings/team", cta: "Invite" },
    { label: "Choose which modules you need", href: "/settings/sections", cta: "Set up" },
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
