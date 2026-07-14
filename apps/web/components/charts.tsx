"use client";

import { useId, useState } from "react";
import type { StageSlice, TrendPoint } from "@business-os/types";

/* Charts are plain SVG on a fixed viewBox scaled by CSS — no chart library.
   Single-series by design: the card title names the series, so no legend is
   needed and the mark carries no identity beyond "this metric". */

const W = 720;
const H = 200;
const PAD = { top: 12, right: 4, bottom: 22, left: 4 };

function scale(data: TrendPoint[]) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length < 2 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  return { x, y, max };
}

function shortDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "short" });
}

export function AreaChart({
  data,
  format,
  title,
  hint,
}: {
  data: TrendPoint[];
  format: (n: number) => string;
  title: string;
  hint?: string;
}) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const { x, y, max } = scale(data);

  if (data.length === 0) return null;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${H - PAD.bottom} L${x(0).toFixed(1)},${H - PAD.bottom} Z`;
  const active = hover === null ? null : data[hover];

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const i = Math.round(frac * (data.length - 1));
    setHover(Math.min(data.length - 1, Math.max(0, i)));
  }

  return (
    <div className="relative">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label={`${title}. Peak ${format(max)}.`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Recessive grid — reference, never the subject. */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(max * f)}
            y2={y(max * f)}
            stroke="var(--color-chart-grid)"
            strokeWidth="1"
          />
        ))}

        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke="var(--color-chart-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* First / last day only — a label on every tick is noise at 14 points. */}
        <text x={PAD.left} y={H - 6} className="fill-[var(--color-fg-subtle)] text-[11px]">{shortDay(data[0].day)}</text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-[var(--color-fg-subtle)] text-[11px]">
          {shortDay(data[data.length - 1].day)}
        </text>

        {hover !== null && active && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--color-line-strong)" strokeWidth="1" />
            {/* 2px surface ring keeps the marker legible where it overlaps the line. */}
            <circle cx={x(hover)} cy={y(active.value)} r="5" fill="var(--color-chart-1)" stroke="var(--color-surface)" strokeWidth="2" />
          </>
        )}
      </svg>

      {hover !== null && active && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%`, top: 0 }}
        >
          <p className="font-semibold">{format(active.value)}</p>
          <p className="text-fg-subtle">{shortDay(active.day)}</p>
        </div>
      )}
    </div>
  );
}

/** Pipeline standing totals, one bar per stage.
 *
 *  Horizontal, not vertical: stage names are words ("Proposal sent"), and
 *  vertical bars would either truncate them or tilt them 45°.
 *
 *  Bars are HTML, not SVG — the labels are real text that wraps, selects, and
 *  scales with the user's font size, which SVG <text> does none of.
 *
 *  One measure (rupees in stage), so no legend and no per-bar hue: colour would
 *  be encoding nothing. The exception is `won`, which is a genuine status rather
 *  than another series, so it takes the status colour and is labelled — never
 *  colour alone. */
export function PipelineBars({
  data,
  format,
  title,
  hint,
}: {
  data: StageSlice[];
  format: (n: number) => string;
  title: string;
  hint?: string;
}) {
  if (data.length === 0) return null;

  // Scale to the largest stage, floor of 1 so an all-empty pipeline doesn't
  // divide by zero and render every bar full-width.
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  const empty = total === 0;

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
      </div>

      {empty ? (
        <p className="py-6 text-center text-sm text-fg-subtle">
          Nothing in the pipeline yet — stages will fill in as deals are added.
        </p>
      ) : (
        <ul className="space-y-3">
          {data.map((d) => {
            const pct = (d.value / max) * 100;
            const won = d.kind === "won";
            return (
              <li key={d.name}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-medium text-fg">{d.name}</span>
                    {/* Status is spelled out, never carried by colour alone. */}
                    {won && <span className="shrink-0 text-[10px] font-medium text-success">won</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-fg-muted">
                    {/* Value leads, count is the qualifier — one big deal and
                        twenty small ones look identical without it. */}
                    <span className="font-semibold text-fg">{format(d.value)}</span>
                    <span className="ml-1.5 text-fg-subtle">
                      {d.count} {d.count === 1 ? "deal" : "deals"}
                    </span>
                  </span>
                </div>
                {/* Track carries the full width so bars read against a common
                    baseline; 4px rounded data-end, anchored left. */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-elevated">
                  <div
                    className={`h-2 rounded-full transition-[width] duration-500 ease-out ${
                      won ? "bg-success" : "bg-[var(--color-chart-1)]"
                    }`}
                    // A stage with money in it never renders as a bare sliver:
                    // below ~2% the bar disappears and reads as zero.
                    style={{ width: `${d.value > 0 ? Math.max(2, pct) : 0}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Bare trend line for stat tiles — no axes, no hover; the tile states the number. */
export function Sparkline({ data }: { data: TrendPoint[] }) {
  if (data.length < 2) return null;
  const w = 120;
  const h = 28;
  const max = Math.max(1, ...data.map((d) => d.value));
  const pts = data
    .map((d, i) => `${(i / (data.length - 1)) * w},${h - (d.value / max) * (h - 3) - 1.5}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-full" aria-hidden="true" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="var(--color-chart-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
