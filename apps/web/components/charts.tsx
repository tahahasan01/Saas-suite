"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import type { StageSlice, TrendPoint } from "@business-os/types";

/* Charts are plain SVG — no chart library. Single-series by design: the card
   title names the series, so no legend is needed and the mark carries no
   identity beyond "this metric".

   The SVG only draws shapes. It stretches to its box (preserveAspectRatio
   "none") at a fixed CSS height, and strokes don't scale with it. Every piece
   of text — axis days, the peak value, the tooltip — is HTML laid over it, so
   it stays 11–12px whether the card is 288px or 2500px wide. With a fixed
   viewBox the text scaled with the width: about 4px on a phone, 24px on an
   ultrawide. */

const VW = 1000;
const VH = 100;
const HEADROOM = 0.9; // the peak sits a little under the top edge

function scale(data: TrendPoint[]) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const x = (i: number) => (data.length < 2 ? VW / 2 : (i / (data.length - 1)) * VW);
  const y = (v: number) => VH - (v / max) * VH * HEADROOM;
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
  const [tipLeft, setTipLeft] = useState(0);
  const plotRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const { x, y, max } = scale(data);

  // Keep the tooltip inside the card: centred on the point, but pushed in at
  // the first and last days instead of hanging off the edge. Measured before
  // paint, so it never flashes in the wrong place.
  useLayoutEffect(() => {
    const plot = plotRef.current;
    const tip = tipRef.current;
    if (hover === null || !plot || !tip) return;
    const w = plot.clientWidth;
    const tw = tip.offsetWidth;
    const cx = (x(hover) / VW) * w;
    setTipLeft(Math.max(0, Math.min(w - tw, cx - tw / 2)));
  }, [hover, data.length]); // x() depends only on the point count

  if (data.length === 0) return null;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(2)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${VH} L${x(0).toFixed(1)},${VH} Z`;
  const active = hover === null ? null : data[hover];

  // Pointer events cover mouse, pen and touch alike: a tap or a sideways drag
  // on a phone shows the tooltip, while `touch-pan-y` leaves vertical swipes
  // to the page (touch-none used to trap the scroll on the chart).
  function pick(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const i = Math.round(frac * (data.length - 1));
    setHover(Math.min(data.length - 1, Math.max(0, i)));
  }

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
      </div>

      <div
        ref={plotRef}
        className="relative h-40 touch-pan-y select-none sm:h-52"
        role="img"
        aria-label={`${title}, ${shortDay(data[0].day)} to ${shortDay(data[data.length - 1].day)}. Peak ${format(max)}.`}
        onPointerDown={pick}
        onPointerMove={pick}
        // A finger lifting fires pointerleave too; keep its tooltip until the
        // next tap. A mouse leaving the chart clears it.
        onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover(null); }}
      >
        <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
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
              x1={0}
              x2={VW}
              y1={y(max * f)}
              y2={y(max * f)}
              stroke="var(--color-chart-grid)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={area} fill={`url(#${gid})`} />
          <path
            d={line}
            fill="none"
            stroke="var(--color-chart-1)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {hover !== null && (
            <line
              x1={x(hover)} x2={x(hover)} y1={0} y2={VH}
              stroke="var(--color-line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Peak label on the top gridline, so the height of the line means something. */}
        <span
          className="pointer-events-none absolute right-0 -translate-y-full pb-0.5 text-[11px] tabular-nums text-fg-subtle"
          style={{ top: pct(y(max), VH) }}
          aria-hidden
        >
          {format(max)}
        </span>

        {hover !== null && active && (
          <>
            {/* HTML, not an SVG circle: the stretched viewBox would make it an oval.
                2px surface ring keeps the marker legible where it overlaps the line. */}
            <span
              className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-[var(--color-chart-1)] box-content"
              style={{ left: pct(x(hover), VW), top: pct(y(active.value), VH) }}
              aria-hidden
            />
            <div
              ref={tipRef}
              className="pointer-events-none absolute top-0 whitespace-nowrap rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-xs shadow-lg"
              style={{ left: tipLeft }}
              aria-hidden
            >
              <p className="font-semibold tabular-nums">{format(active.value)}</p>
              <p className="text-fg-subtle">{shortDay(active.day)}</p>
            </div>
          </>
        )}
      </div>

      {/* First / last day only — a label on every tick is noise at 14 points. */}
      <div className="mt-1.5 flex justify-between text-[11px] text-fg-subtle" aria-hidden>
        <span>{shortDay(data[0].day)}</span>
        {data.length > 1 && <span>{shortDay(data[data.length - 1].day)}</span>}
      </div>
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
export function Sparkline({ data, color = "var(--color-chart-1)" }: { data: TrendPoint[]; color?: string }) {
  if (data.length < 2) return null;
  const w = 120;
  const h = 28;
  const max = Math.max(1, ...data.map((d) => d.value));
  const pts = data
    .map((d, i) => `${(i / (data.length - 1)) * w},${h - (d.value / max) * (h - 3) - 1.5}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-full" aria-hidden="true" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
