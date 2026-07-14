"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion, useScrollProgress } from "./useScrollProgress";

/* A pinned rail: the section holds the viewport while the cards travel
   sideways, then releases. The vertical distance the section occupies is
   *measured* from the track's own width, so one pixel of wheel is one pixel of
   card travel — the reason it reads as dragging the rail rather than as a
   hijack with its own opinions about speed.

   Every card is a surface the product actually ships. */

const CARDS = [
  {
    kicker: "Sales / CRM",
    title: "A pipeline that scores itself",
    body: "Drag a deal and the forecast moves. Leads rank themselves, duplicates surface before they split a customer in two.",
    visual: <VisualPipeline />,
  },
  {
    kicker: "POS & Inventory",
    title: "Billing at keyboard speed",
    body: "Scan, total, print. The same sale that clears the counter is the one that draws down your stock — no export, no re-typing.",
    visual: <VisualBilling />,
  },
  {
    kicker: "Staff / HRMS",
    title: "Payroll on the real slabs",
    body: "Attendance and leave feed payroll, computed on the FBR 2025-26 tax slabs. Absence is arithmetic, not a guess.",
    visual: <VisualPayroll />,
  },
  {
    kicker: "AI, everywhere",
    title: "Ask it in plain language",
    body: "Every screen has a prompt box. It writes the query, runs it against your workspace only, and answers in your own numbers.",
    visual: <VisualAsk />,
  },
  {
    kicker: "Automations",
    title: "The busywork, handled",
    body: "When a deal is won, when stock dips, when an invoice ages — pick the trigger, and it happens without anyone remembering to.",
    visual: <VisualFlow />,
  },
];

export function ScrollGallery() {
  const { ref, progress } = useScrollProgress<HTMLElement>();
  const trackRef = useRef<HTMLDivElement>(null);
  const [distance, setDistance] = useState(0);
  const reduced = useReducedMotion();

  // How far the track must travel for its last card to land flush with the
  // right edge. Measured rather than derived from card count, so it stays
  // correct as the cards reflow across breakpoints.
  useEffect(() => {
    const measure = () => {
      const t = trackRef.current;
      if (!t) return;
      setDistance(Math.max(0, t.scrollWidth - window.innerWidth));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Reduced motion: same cards, same order, but the rail becomes an ordinary
  // horizontal scroller the reader drives directly. Nothing is pinned.
  if (reduced) {
    return (
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <GalleryHeading />
        </div>
        <ul className="mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto px-6 pb-4">
          {CARDS.map((c, i) => (
            <li key={c.title} className="snap-start">
              <Card {...c} index={i} active={false} />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const active = Math.min(CARDS.length - 1, Math.round(progress * (CARDS.length - 1)));

  return (
    <section ref={ref} style={{ height: `calc(100vh + ${distance}px)` }} aria-label="Product modules">
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden">
        <div className="mx-auto w-full max-w-6xl px-6">
          <GalleryHeading />
        </div>

        <div
          ref={trackRef}
          className="mt-9 flex w-max gap-5 px-6 will-change-transform"
          style={{ transform: `translate3d(${-progress * distance}px, 0, 0)` }}
        >
          {CARDS.map((c, i) => (
            <Card key={c.title} {...c} index={i} active={i === active} />
          ))}
        </div>

        {/* Rail: the only affordance telling the reader the section has an end. */}
        <div className="mx-auto mt-9 flex w-full max-w-6xl items-center gap-4 px-6">
          <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
            {String(active + 1).padStart(2, "0")} / {String(CARDS.length).padStart(2, "0")}
          </span>
          <div className="h-px flex-1 bg-line">
            <div
              className="h-px origin-left bg-brand transition-transform duration-100 ease-out"
              style={{ transform: `scaleX(${Math.max(0.02, progress)})` }}
            />
          </div>
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle sm:block">
            Keep scrolling
          </span>
        </div>
      </div>
    </section>
  );
}

function GalleryHeading() {
  return (
    <>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand">Nº001 — The product</p>
      <h2 className="mt-3 max-w-2xl text-[clamp(1.9rem,4.4vw,3.4rem)] font-black uppercase leading-[0.95] tracking-[-0.03em]">
        Five surfaces.<br />One system underneath.
      </h2>
    </>
  );
}

function Card({
  kicker,
  title,
  body,
  visual,
  index,
  active,
}: {
  kicker: string;
  title: string;
  body: string;
  visual: React.ReactNode;
  index: number;
  active: boolean;
}) {
  return (
    <article
      className={`edge-lit flex h-[clamp(360px,58vh,480px)] w-[min(80vw,400px)] shrink-0 flex-col overflow-hidden rounded-2xl border bg-gradient-to-b from-surface/90 to-surface/40 p-6 transition-colors duration-500 ${
        active ? "border-brand/45" : "border-line"
      }`}
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
          Nº{String(index + 1).padStart(3, "0")}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand">{kicker}</span>
      </div>

      <h3 className="mt-5 text-xl font-bold leading-tight tracking-tight">{title}</h3>
      <p className="mt-2.5 text-sm leading-relaxed text-fg-muted">{body}</p>

      {/* Visual sits at the foot of the card and is allowed to bleed off the
          bottom edge — a cropped surface reads as a real screen continuing
          past the frame, where a contained one reads as an icon. */}
      <div className="relative mt-auto -mb-6 pt-6">{visual}</div>
    </article>
  );
}

/* ─── Card visuals ─────────────────────────────────────────────────────────
   Small, honest mocks of the matching screen. Same shapes as the real thing,
   not illustrations of it. */

function VisualPipeline() {
  const cols: [string, string[]][] = [
    ["New", ["Khan Traders", "Malik & Co"]],
    ["Qualified", ["Ayesha Textiles", "Zeeshan Rice"]],
    ["Won", ["Rehman Foods"]],
  ];
  return (
    <div className="grid grid-cols-3 gap-2 rounded-t-lg border border-b-0 border-line bg-canvas/50 p-2.5">
      {cols.map(([stage, deals], i) => (
        <div key={stage}>
          <p className="mb-1.5 font-mono text-[8px] uppercase tracking-wider text-fg-subtle">{stage}</p>
          <div className="space-y-1.5">
            {deals.map((d) => (
              <div
                key={d}
                className={`rounded border px-1.5 py-1.5 text-[8px] leading-tight ${
                  i === 2 ? "border-success/30 bg-success/10 text-success" : "border-line bg-elevated/70 text-fg-muted"
                }`}
              >
                {d}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function VisualBilling() {
  const lines: [string, string][] = [
    ["Basmati 5kg × 2", "₨ 4,300"],
    ["Cooking oil 1L", "₨ 620"],
    ["Tea 950g", "₨ 1,180"],
  ];
  return (
    <div className="rounded-t-lg border border-b-0 border-line bg-canvas/50 p-3">
      {lines.map(([item, amt]) => (
        <div key={item} className="flex justify-between border-b border-line/70 py-1.5 text-[9px]">
          <span className="text-fg-muted">{item}</span>
          <span className="tabular-nums text-fg">{amt}</span>
        </div>
      ))}
      <div className="flex justify-between pt-2 text-[10px] font-semibold">
        <span>Total</span>
        <span className="tabular-nums text-brand">₨ 6,100</span>
      </div>
    </div>
  );
}

function VisualPayroll() {
  const rows: [string, string, string][] = [
    ["Ayesha K.", "₨ 118,000", "₨ 9,430"],
    ["Bilal R.", "₨ 74,500", "₨ 2,180"],
    ["Sana M.", "₨ 96,000", "₨ 5,600"],
  ];
  return (
    <div className="rounded-t-lg border border-b-0 border-line bg-canvas/50 p-3">
      <div className="flex justify-between pb-1.5 font-mono text-[8px] uppercase tracking-wider text-fg-subtle">
        <span>Employee</span>
        <span>Gross · Tax</span>
      </div>
      {rows.map(([name, gross, tax]) => (
        <div key={name} className="flex justify-between border-t border-line/70 py-1.5 text-[9px]">
          <span className="text-fg-muted">{name}</span>
          <span className="tabular-nums">
            <span className="text-fg">{gross}</span> <span className="text-warning">{tax}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function VisualAsk() {
  return (
    <div className="rounded-t-lg border border-b-0 border-line bg-canvas/50 p-3">
      <div className="flex items-center gap-1.5 rounded border border-brand/30 bg-brand-subtle/40 px-2 py-1.5">
        <span className="text-[9px] text-brand">✦</span>
        <span className="text-[9px] text-fg-muted">which products won&apos;t last the week?</span>
      </div>
      <p className="mt-2.5 text-[9px] leading-relaxed text-fg">
        <span className="font-semibold">4 products</span> fall below reorder before Sunday. Basmati 5kg runs out{" "}
        <span className="font-semibold text-brand">Thursday</span>.
      </p>
      <p className="mt-2 truncate font-mono text-[7px] text-fg-subtle">
        select sku from ai_v_stock where days_cover &lt; 7…
      </p>
    </div>
  );
}

function VisualFlow() {
  const nodes: [string, string][] = [
    ["When", "a deal is won"],
    ["Then", "draw down stock"],
    ["And", "send the invoice"],
  ];
  return (
    <div className="space-y-1.5 rounded-t-lg border border-b-0 border-line bg-canvas/50 p-3">
      {nodes.map(([when, what], i) => (
        <div key={what} className="flex items-center gap-2">
          <span
            className={`w-9 shrink-0 font-mono text-[8px] uppercase tracking-wider ${
              i === 0 ? "text-brand" : "text-fg-subtle"
            }`}
          >
            {when}
          </span>
          <div className="flex-1 rounded border border-line bg-elevated/70 px-2 py-1.5 text-[9px] text-fg-muted">
            {what}
          </div>
        </div>
      ))}
    </div>
  );
}
