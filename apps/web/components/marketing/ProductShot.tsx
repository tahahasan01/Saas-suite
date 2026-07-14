"use client";

/* A faithful mock of the real dashboard — same tiles, same trend, same alert
   band. Grey placeholder bars read as a loading state; showing the actual
   product is what makes a landing page credible. Static by design: it is a
   photograph of the app, not a second implementation of it. */

const KPIS = [
  { label: "Open leads", value: "24", delta: "+12%", up: true },
  { label: "Won this month", value: "₨1.4M", delta: "+31%", up: true },
  { label: "Revenue today", value: "₨86K", delta: "−4%", up: false },
  { label: "Present today", value: "18/21", delta: null, up: true },
];

// A fortnight of revenue, shaped like a real week-on-week rhythm.
const SERIES = [32, 41, 38, 55, 49, 62, 58, 71, 65, 79, 74, 88, 82, 96];

const NAV = ["Dashboard", "Sales", "POS", "Staff", "Automations", "Settings"];

const ACTIVITY = [
  ["Ayesha", "won a deal", "2m"],
  ["Bilal", "billed a sale", "14m"],
  ["System", "flagged low stock", "1h"],
];

function Chart() {
  const w = 560;
  const h = 120;
  const max = Math.max(...SERIES);
  const x = (i: number) => (i / (SERIES.length - 1)) * w;
  const y = (v: number) => h - (v / max) * (h - 12) - 6;
  const line = SERIES.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" aria-hidden>
      {/* Tokens, not literals: this chart used to hardcode #262b39 rules and a
          #14171f marker ring, which are invisible the moment the page is in
          light mode. --color-chart-* already exists for exactly this. */}
      <defs>
        <linearGradient id="shot-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.6, 0.95].map((f) => (
        <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} stroke="var(--color-chart-grid)" strokeWidth="1" />
      ))}
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#shot-fill)" />
      <path
        d={line}
        fill="none"
        stroke="var(--color-chart-1)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* The marker ring is the card's own surface punching through the line —
          so it has to track the surface token, not a fixed near-black. */}
      <circle
        cx={x(SERIES.length - 1)}
        cy={y(SERIES[SERIES.length - 1])}
        r="4"
        fill="var(--color-chart-1)"
        stroke="var(--color-surface)"
        strokeWidth="2"
      />
    </svg>
  );
}

export function ProductShot() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-black/50">
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 border-b border-line bg-elevated/60 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
        <span className="ml-3 rounded-md bg-canvas/70 px-2 py-0.5 text-[10px] text-fg-subtle">
          businessos.pk/dashboard
        </span>
      </div>

      <div className="grid grid-cols-[128px_1fr] sm:grid-cols-[148px_1fr]">
        {/* Sidebar */}
        <aside className="hidden border-r border-line bg-canvas/40 p-3 sm:block">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center rounded bg-brand text-[9px] font-bold text-white">B</span>
            <span className="text-[11px] font-semibold">Business OS</span>
          </div>
          <ul className="space-y-1">
            {NAV.map((n, i) => (
              <li
                key={n}
                className={`rounded-md px-2 py-1.5 text-[10px] ${i === 0 ? "bg-brand-subtle text-brand" : "text-fg-subtle"}`}
              >
                {n}
              </li>
            ))}
          </ul>
        </aside>

        <div className="space-y-3 p-3 sm:p-4">
          <div>
            <p className="text-xs font-semibold sm:text-sm">Good to see you, Ayesha</p>
            <p className="text-[10px] text-fg-subtle">Here&apos;s what&apos;s happening in Khan Traders.</p>
          </div>

          {/* Alert band — the cross-module payoff, visible at a glance */}
          <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-2.5 py-1.5">
            <span className="text-[9px] text-warning">●</span>
            <span className="text-[9px] text-fg-muted">3 open leads have had no contact in 7 days</span>
          </div>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {KPIS.map((k) => (
              <div key={k.label} className="rounded-lg border border-line bg-elevated/50 p-2">
                <div className="flex items-start justify-between gap-1">
                  <p className="text-[8px] text-fg-muted">{k.label}</p>
                  {k.delta && (
                    <span className={`text-[8px] font-medium ${k.up ? "text-success" : "text-danger"}`}>{k.delta}</span>
                  )}
                </div>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">{k.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-2 lg:grid-cols-[1fr_130px]">
            <div className="rounded-lg border border-line bg-elevated/40 p-2.5">
              <div className="mb-1 flex items-baseline justify-between">
                <p className="text-[9px] font-semibold">Revenue</p>
                <p className="text-[8px] text-fg-subtle">Last 14 days</p>
              </div>
              <Chart />
            </div>
            <div className="hidden rounded-lg border border-line bg-elevated/40 p-2.5 lg:block">
              <p className="mb-1.5 text-[9px] font-semibold">Activity</p>
              <ul className="space-y-1.5">
                {ACTIVITY.map(([who, what, when]) => (
                  <li key={who} className="flex gap-1.5">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-brand" />
                    <div>
                      <p className="text-[8px] leading-tight">
                        <span className="font-medium">{who}</span> <span className="text-fg-muted">{what}</span>
                      </p>
                      <p className="text-[7px] text-fg-subtle">{when} ago</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* AI prompt box */}
          <div className="flex items-center gap-2 rounded-lg border border-brand/30 bg-brand-subtle/40 px-2.5 py-2">
            <span className="text-[10px] text-brand">✦</span>
            <span className="text-[9px] text-fg-subtle">Ask anything about your business…</span>
          </div>
        </div>
      </div>
    </div>
  );
}
