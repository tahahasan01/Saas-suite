"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion, useScrollProgress } from "./useScrollProgress";

/* A pinned rail: the section holds the viewport while the cards travel
   sideways, then releases. Vertical distance is measured from the track's real
   width, so one pixel of wheel is one pixel of card travel — that 1:1 mapping
   is what makes it read as dragging a rail rather than as a hijack with its
   own opinion about speed.

   CARD_W is vw-based with a px floor and NO max cap, and that is load-bearing.
   A capped width (min(80vw, 400px)) pins the track at ~2.1kpx — narrower than
   a 2450px ultrawide — so `scrollWidth - innerWidth` goes negative, travel
   collapses to zero, and the section silently degrades into a static row of
   squashed cards. Sizing in vw keeps the track ≈ CARDS × 24vw, i.e. wider than
   the viewport by construction, on a phone and on a 4K display alike.

   Every claim below is backed by shipped code, cited per card. A card whose
   line stops being true comes out. */

const CARD_W = "max(300px, 24vw)";

const CARDS = [
  {
    kicker: "Sales / CRM",
    title: "Two records, one customer",
    body: "Exact match on phone and email, plus fuzzy matching on company name. It surfaces up to five candidates and tells you why — before the split happens.",
    visual: <VisualDuplicate />, // crm.py:142-154 — pg_trgm similarity()
  },
  {
    kicker: "Sales / CRM",
    title: "Every lead scored 1–100",
    body: "A transparent weighting of source, contact detail and deal size. No API key, no black box — you can read the rule that ranked your list.",
    visual: <VisualScoring />, // scoring.py:13-25
  },
  {
    kicker: "POS & Inventory",
    title: "Restock before you run out",
    body: "Thirty days of real velocity per SKU. Anything with under ten days of cover gets flagged, with a quantity that carries you back to thirty.",
    visual: <VisualRestock />, // pos.py:293-315
  },
  {
    kicker: "POS & Inventory",
    title: "Ramadan is on the calendar",
    body: "A sixty-day look-ahead joins your fastest movers against Pakistani occasions — Ramadan, Eid, Back to School — and lifts the forecast to match.",
    visual: <VisualSeasonal />, // pos.py:318-345, 0011_occasions.sql
  },
  {
    kicker: "FBR Digital Invoicing",
    title: "Filed with FBR, or filed later",
    body: "Real transmission to the PRAL gateway. If it doesn't go through, the sale still completes and the invoice retries on its own — up to eight times.",
    visual: <VisualFbr />, // fbr.py:27-30, fbr_submit.py:16,97-140
  },
  {
    kicker: "Staff / HRMS",
    title: "Payroll on the 2025-26 slabs",
    body: "Six salaried brackets, applied to gross pay that attendance and leave have already adjusted. Absence is arithmetic, not an argument.",
    visual: <VisualPayroll />, // payroll.py:9-16
  },
  {
    kicker: "AI, everywhere",
    title: "Ask across the whole business",
    body: "Your CRM can't see your stock. Your POS can't see your staff. Here one question crosses all three — it writes the query, runs it read-only against your workspace, and answers in your own numbers.",
    visual: <VisualAsk />, // ai/gateway.py:80-138, 0020_ai_cross_module.sql
  },
  {
    kicker: "Platform",
    title: "Isolation the database enforces",
    body: "Row-level security on every tenant table — not a WHERE clause someone has to remember. A cross-tenant read returns nothing, and a test proves it.",
    visual: <VisualRls />, // db.py:62-69, tests/test_rls.py
  },
  {
    kicker: "Platform",
    title: "Seven trades, seven vocabularies",
    body: "A pharmacy has patients, a school has students. The words come from a table, not a translation file — so the whole app changes at signup.",
    visual: <VisualTerminology />, // seed.py:12-55, terminology.py:23-35
  },
];

export function ScrollGallery() {
  const { ref, progress } = useScrollProgress<HTMLElement>();
  const trackRef = useRef<HTMLDivElement>(null);
  const [distance, setDistance] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const t = trackRef.current;
    if (!t) return;
    // ResizeObserver rather than a resize listener: the track's width changes
    // when the cards reflow, which a window resize event doesn't reliably
    // reflect by the time it fires.
    const ro = new ResizeObserver(() => setDistance(Math.max(0, t.scrollWidth - window.innerWidth)));
    ro.observe(t);
    return () => ro.disconnect();
  }, []);

  // Reduced motion: same cards, same order, but the rail becomes an ordinary
  // horizontal scroller the reader drives directly. Nothing pins.
  if (reduced) {
    return (
      <section className="py-20">
        <div className="mx-auto max-w-[1600px] px-6">
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
    <section ref={ref} style={{ height: `calc(100vh + ${distance}px)` }} aria-label="What Business OS ships">
      <div className="sticky top-0 flex h-screen flex-col justify-center gap-7 overflow-hidden py-10">
        <div className="mx-auto w-full max-w-[1600px] shrink-0 px-6">
          <GalleryHeading />
        </div>

        <div
          ref={trackRef}
          className="flex w-max gap-5 px-6 will-change-transform"
          style={{ transform: `translate3d(${-progress * distance}px, 0, 0)` }}
        >
          {CARDS.map((c, i) => (
            <Card key={c.title} {...c} index={i} active={i === active} />
          ))}
        </div>

        {/* The only affordance telling the reader this section has an end. */}
        <div className="mx-auto flex w-full max-w-[1600px] shrink-0 items-center gap-4 px-6">
          <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
            {String(active + 1).padStart(2, "0")} / {String(CARDS.length).padStart(2, "0")}
          </span>
          <div className="h-px flex-1 bg-line">
            <div
              className="h-px origin-left bg-brand transition-transform duration-100 ease-out"
              style={{ transform: `scaleX(${Math.max(0.015, progress)})` }}
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
    <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand">Nº001 — Shipped</p>
        <h2 className="mt-3 text-[clamp(1.7rem,3.4vw,2.9rem)] font-black uppercase leading-[0.95] tracking-[-0.03em]">
          Nine things it does today.
        </h2>
      </div>
      <p className="max-w-sm text-sm leading-relaxed text-fg-muted">
        Not a roadmap. Every card is running code — the kind a competitor has to build, not announce.
      </p>
    </div>
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
      className={`edge-lit flex h-[clamp(340px,54vh,520px)] shrink-0 flex-col overflow-hidden rounded-2xl border bg-gradient-to-b from-surface/90 to-surface/40 p-6 transition-colors duration-500 ${
        active ? "border-brand/45" : "border-line"
      }`}
      style={{ width: CARD_W }}
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
          Nº{String(index + 1).padStart(3, "0")}
        </span>
        <span className="truncate font-mono text-[11px] uppercase tracking-[0.18em] text-brand">{kicker}</span>
      </div>

      <h3 className="mt-5 text-[clamp(1.05rem,1.5vw,1.4rem)] font-bold leading-tight tracking-tight">{title}</h3>
      <p className="mt-2.5 line-clamp-4 text-[13px] leading-relaxed text-fg-muted">{body}</p>

      {/* Cropped at the card's foot: a surface continuing past the frame reads
          as a real screen, where a fully contained one reads as an icon. */}
      <div className="relative mt-auto -mb-6 pt-5">{visual}</div>
    </article>
  );
}

/* ─── Card visuals ─────────────────────────────────────────────────────────
   Honest mocks of the matching surface. Identifiers, thresholds and numbers
   are the real ones from the cited code — a fake screenshot of a real feature
   is still a fake screenshot. */

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-t-lg border border-b-0 border-line bg-canvas/50 p-3">{children}</div>;
}

function VisualDuplicate() {
  return (
    <Panel>
      <div className="flex items-center gap-1.5 rounded border border-warning/30 bg-warning/5 px-2 py-1.5">
        <span className="text-[9px] text-warning">●</span>
        <span className="text-[9px] text-fg-muted">2 possible duplicates</span>
      </div>
      {[
        ["Khan Traders", "same phone"],
        ["Khan Traders (Pvt)", "87% similar"],
      ].map(([name, why]) => (
        <div key={name} className="mt-1.5 flex items-center justify-between gap-2 border-t border-line/70 pt-1.5">
          <span className="truncate text-[9px] text-fg">{name}</span>
          <span className="shrink-0 font-mono text-[8px] text-fg-subtle">{why}</span>
        </div>
      ))}
    </Panel>
  );
}

function VisualScoring() {
  const parts: [string, string, number][] = [
    ["Referral source", "+30", 100],
    ["Deal value", "+22", 73],
    ["Base", "+20", 66],
    ["Company named", "+10", 33],
  ];
  return (
    <Panel>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono text-[8px] uppercase tracking-wider text-fg-subtle">Score</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-brand">82</span>
      </div>
      {parts.map(([label, delta, pct]) => (
        <div key={label} className="mt-1 flex items-center gap-2">
          <span className="w-20 shrink-0 truncate text-[8px] text-fg-muted">{label}</span>
          <span className="h-1 flex-1 rounded-full bg-elevated">
            <span className="block h-1 rounded-full bg-brand/70" style={{ width: `${pct}%` }} />
          </span>
          <span className="w-6 shrink-0 text-right font-mono text-[8px] tabular-nums text-fg-subtle">{delta}</span>
        </div>
      ))}
    </Panel>
  );
}

function VisualRestock() {
  const rows: [string, string, boolean][] = [
    ["Basmati 5kg", "4 days", true],
    ["Cooking oil 1L", "8 days", true],
    ["Tea 950g", "26 days", false],
  ];
  return (
    <Panel>
      <div className="flex justify-between pb-1.5 font-mono text-[8px] uppercase tracking-wider text-fg-subtle">
        <span>SKU</span>
        <span>Cover</span>
      </div>
      {rows.map(([sku, cover, low]) => (
        <div key={sku} className="flex justify-between border-t border-line/70 py-1.5 text-[9px]">
          <span className="text-fg-muted">{sku}</span>
          <span className={`font-mono tabular-nums ${low ? "text-warning" : "text-fg-subtle"}`}>{cover}</span>
        </div>
      ))}
    </Panel>
  );
}

function VisualSeasonal() {
  return (
    <Panel>
      <div className="flex items-center gap-1.5">
        <span className="rounded bg-brand-subtle px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-brand">
          In 41 days
        </span>
        <span className="text-[9px] text-fg">Ramadan</span>
      </div>
      {[
        ["Basmati 5kg", "+40%"],
        ["Cooking oil 1L", "+35%"],
      ].map(([sku, lift]) => (
        <div key={sku} className="mt-1.5 flex justify-between border-t border-line/70 pt-1.5 text-[9px]">
          <span className="text-fg-muted">{sku}</span>
          <span className="font-mono tabular-nums text-success">{lift}</span>
        </div>
      ))}
    </Panel>
  );
}

function VisualFbr() {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[8px] uppercase tracking-wider text-fg-subtle">FBR invoice</p>
          <p className="mt-0.5 truncate font-mono text-[9px] text-fg">7000007DI16112…</p>
          <p className="mt-1.5 inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-[8px] text-success">
            ● statusCode 00
          </p>
        </div>
        {/* Stand-in for the QR the real receipt renders (FbrStamp.tsx). */}
        <div className="grid h-11 w-11 shrink-0 grid-cols-4 gap-px rounded-sm bg-fg/90 p-1" aria-hidden>
          {Array.from({ length: 16 }, (_, i) => (
            <span key={i} className={`rounded-[1px] ${i % 3 === 0 || i === 5 || i === 10 ? "bg-canvas" : ""}`} />
          ))}
        </div>
      </div>
    </Panel>
  );
}

function VisualPayroll() {
  const slabs: [string, string][] = [
    ["Up to ₨600k", "0%"],
    ["₨1.2M", "5%"],
    ["₨2.2M", "15%"],
    ["₨3.2M", "25%"],
  ];
  return (
    <Panel>
      <p className="pb-1.5 font-mono text-[8px] uppercase tracking-wider text-fg-subtle">Salaried slabs · 2025-26</p>
      {slabs.map(([band, rate]) => (
        <div key={band} className="flex justify-between border-t border-line/70 py-1.5 text-[9px]">
          <span className="text-fg-muted">{band}</span>
          <span className="font-mono tabular-nums text-fg">{rate}</span>
        </div>
      ))}
    </Panel>
  );
}

function VisualAsk() {
  return (
    <Panel>
      <div className="flex items-center gap-1.5 rounded border border-brand/30 bg-brand-subtle/40 px-2 py-1.5">
        <span className="text-[9px] text-brand">✦</span>
        <span className="truncate text-[9px] text-fg-muted">which products are low on stock?</span>
      </div>
      <p className="mt-2.5 text-[9px] leading-relaxed text-fg">
        <span className="font-semibold">4 products</span> are below their reorder point. Basmati 5kg is moving fastest.
      </p>
      <p className="mt-2 truncate font-mono text-[7px] text-fg-subtle">
        select name from ai_v_products where is_low_stock…
      </p>
    </Panel>
  );
}

function VisualRls() {
  return (
    <Panel>
      <p className="font-mono text-[8px] uppercase tracking-wider text-fg-subtle">Tenant B asks for Tenant A</p>
      <p className="mt-1.5 truncate font-mono text-[8px] text-fg-muted">
        select * from leads where tenant_id = &lsquo;A&rsquo;
      </p>
      <div className="mt-2 flex items-center gap-1.5 border-t border-line/70 pt-2">
        <span className="text-[9px] text-success">✓</span>
        <span className="font-mono text-[8px] text-success">0 rows — policy, not filter</span>
      </div>
    </Panel>
  );
}

function VisualTerminology() {
  const map: [string, string][] = [
    ["Pharmacy", "Patient"],
    ["Education", "Student"],
    ["Restaurant", "Guest"],
  ];
  return (
    <Panel>
      <p className="pb-1.5 font-mono text-[8px] uppercase tracking-wider text-fg-subtle">A lead is called…</p>
      {map.map(([industry, word]) => (
        <div key={industry} className="flex justify-between border-t border-line/70 py-1.5 text-[9px]">
          <span className="text-fg-muted">{industry}</span>
          <span className="text-brand">{word}</span>
        </div>
      ))}
    </Panel>
  );
}
