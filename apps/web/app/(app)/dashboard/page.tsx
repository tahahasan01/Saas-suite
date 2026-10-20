"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { DashboardOverview, Kpi, TrendPoint } from "@business-os/types";
import { api } from "@/lib/api";
import { formatNumber, money, moneyCompact, timeAgo } from "@/lib/format";
import { qk } from "@/lib/queryKeys";
import { useSession } from "@/lib/session";
import { errorText } from "@/lib/useAction";
import { Card, ErrorState } from "@/components/ui";
import { AiPrompt } from "@/components/AiPrompt";
import { AreaChart, PipelineBars, Sparkline } from "@/components/charts";
import { MODULES, moduleFor, tileStyle } from "@/lib/modules";

/** The pattern for moving a page onto TanStack Query (F10): the key comes from
 *  lib/queryKeys, the fetcher is plain api<T>(), and the page reads
 *  isPending / error / data instead of keeping three useStates in step. */
function useDashboardOverview() {
  return useQuery({
    queryKey: qk.dashboard.overview(),
    queryFn: ({ signal }) => api<DashboardOverview>("/dashboard/overview", { signal }),
  });
}

export default function Dashboard() {
  const { me, t } = useSession();
  // A failed load used to render nothing at all under the AI box — an empty
  // page that looked like a quiet day.
  const overview = useDashboardOverview();
  const data = overview.data ?? null;
  // A retry after a failure shows the skeleton again, not the stale error.
  const loading = overview.isPending || (overview.isError && overview.isFetching);
  const error = overview.error ? errorText(overview.error, "Couldn't load your dashboard.") : null;
  const load = () => void overview.refetch();

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
        <h1 className="break-words font-display text-2xl font-bold tracking-tight sm:text-[28px]">Good to see you, {firstName}</h1>
        <p className="mt-1 text-sm text-fg-muted">Here&apos;s what&apos;s happening in {me.tenant.name}.</p>
      </header>

      <AiPrompt />

      {loading ? (
        <SkeletonGrid />
      ) : error || !data ? (
        <ErrorState message={error ?? "Couldn't load your dashboard."} onRetry={load} />
      ) : !hasSignal ? (
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

          {/* Was a second AreaChart of leads_trend — the same shape as the one
              above it, so the page showed one idea twice while never answering
              "where is my money sitting?". The leads trend still exists, as the
              sparkline inside its own tile, which is where a supporting series
              belongs. This asks a different question, so it gets a different
              form. */}
          {data.pipeline.length > 0 && (
            <Card>
              {/* "deals" comes from the terminology table, so a school reads
                  "Admissions by stage" and a clinic "Sales by stage". */}
              <PipelineBars
                data={data.pipeline}
                format={(n) => moneyCompact(n)}
                title={`${t("deals")} by stage`}
                hint={`${data.pipeline.reduce((s, d) => s + d.count, 0)} total`}
              />
            </Card>
          )}
        </div>
      )}
    </>
  );
}

/** A tile wears the colour and icon of the module its number comes from, so
 *  "Rs 42k" reads as sales and "12" as staff before the label is read. */
function StatTile({ kpi, trend }: { kpi: Kpi; trend?: TrendPoint[] }) {
  const value = kpi.kind === "money" ? moneyCompact(kpi.value) : formatNumber(kpi.value);
  const m = moduleFor(kpi.href, MODULES);
  const token = m?.color ?? "--color-brand";
  const color = `var(${token})`;
  const Icon = m?.icon;
  return (
    <Link href={kpi.href} className="group">
      <Card className="relative h-full overflow-hidden transition-colors group-hover:border-line-strong">
        <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} aria-hidden />
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && (
              <span className="grid h-8 w-8 place-items-center rounded-lg" style={tileStyle(token)}>
                <Icon size={16} strokeWidth={2.2} aria-hidden />
              </span>
            )}
            <p className="min-w-0 truncate text-sm font-medium text-fg-muted" title={kpi.label}>{kpi.label}</p>
          </div>
          {kpi.delta_pct !== null && <Delta pct={kpi.delta_pct} />}
        </div>
        <p className="mt-3 font-display text-[28px] font-bold leading-none tracking-tight tabular-nums">{value}</p>
        {trend && <div className="mt-3"><Sparkline data={trend} color={color} /></div>}
      </Card>
    </Link>
  );
}

function Delta({ pct }: { pct: number }) {
  const up = pct >= 0;
  // Arrow + sign carry the direction; colour only reinforces it.
  return (
    <span className={`shrink-0 text-xs font-medium tabular-nums ${up ? "text-success" : "text-danger"}`}>
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
                  {/* Truncated to one line, so the full sentence lives in the title. */}
                  <p className="truncate" title={`${a.actor ?? "System"} ${verb} a ${a.entity}`}>
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
          <li key={s.label} className="flex items-center justify-between gap-3 rounded-lg border border-line px-4 py-3">
            <span className="flex items-center gap-3">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-elevated text-xs font-semibold text-fg-muted">{i + 1}</span>
              <span className="text-sm">{s.label}</span>
            </span>
            <Link href={s.href} className="inline-flex shrink-0 items-center rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-fg hover:bg-brand-hover pointer-coarse:min-h-11">
              {s.cta}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
