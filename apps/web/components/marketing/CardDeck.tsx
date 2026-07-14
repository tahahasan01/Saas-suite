"use client";

import { useReducedMotion, useScrollProgress } from "./useScrollProgress";

/* A dealt deck: each card sticks a little lower than the one before, so as you
   scroll the next slides up and covers the last, leaving its top edge showing.
   The stack behind you is the progress indicator — you can see what you've read.

   Three things are load-bearing:

   1. Cards are OPAQUE. The horizontal rail could use `from-surface/90` because
      nothing sat behind it; here a translucent card shows the whole deck
      bleeding through and the effect collapses into mush.
   2. The scale transform sits on an element INSIDE the sticky wrapper, never on
      the wrapper itself — a transform makes the element a containing block,
      which silently kills `position: sticky`.
   3. No ancestor may clip: `overflow: hidden` anywhere above a sticky element
      disables it just as quietly. That's why this section has no overflow rule.

   Every claim is backed by shipped code, cited per card. A card whose line
   stops being true comes out. */

const TOP = 88; // clears the sticky header, leaves the stack breathing room
const STEP = 13; // how much of each spent card stays visible above the next
// Scroll distance between cards. Kept tight on purpose: at 300 the next card
// only arrived long after the last had settled, so the section read as a sparse
// list that happened to stick. A deck wants the next card already climbing.
const GAP = 110;

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
  {
    kicker: "Platform",
    title: "Turn off what you don't use",
    body: "Sales, POS and Staff switch on and off in Settings. Off means gone from the nav — no clutter, no upsell nag — and the data stays put for when you switch it back.",
    visual: <VisualSections />, // models.py:23 SECTIONS, app/(app)/settings/sections/
  },
];

export function CardDeck() {
  const { ref, progress } = useScrollProgress<HTMLElement>();
  const reduced = useReducedMotion();

  // Reduced motion: the same cards as an ordinary list. Nothing sticks, nothing
  // scales — a stacking deck is exactly the vestibular trigger the media query
  // exists for. Keeps id/aria so `#modules` still lands here.
  if (reduced) {
    return (
      <section id="modules" aria-label="What Business OS ships" className="mx-auto max-w-[1100px] px-6 py-20">
        <DeckHeading />
        <ul className="mt-10 space-y-5">
          {CARDS.map((c, i) => (
            <li key={c.title}>
              <Card {...c} index={i} />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  // Which card is on top right now, as a float — the fractional part is what
  // makes the ones behind ease back rather than snap.
  const active = progress * CARDS.length;

  return (
    // id="modules" — the header nav points here now that the old Modules
    // section (and its orbit) is gone.
    <section
      ref={ref}
      id="modules"
      aria-label="What Business OS ships"
      className="mx-auto max-w-[1100px] px-6 pb-24 pt-20"
    >
      <DeckHeading />

      <div className="mt-10">
        {CARDS.map((c, i) => {
          // Depth = how many cards have landed on top of this one. Capped at 3:
          // past that the card is buried, and letting it keep shrinking makes
          // the bottom of the stack visibly lopsided.
          const depth = Math.max(0, Math.min(3, active - i));
          const isLast = i === CARDS.length - 1;
          return (
            <div
              key={c.title}
              className="sticky"
              style={{ top: TOP + i * STEP, marginBottom: isLast ? 0 : GAP }}
            >
              <div
                className="origin-top transition-transform duration-200 ease-out"
                style={{ transform: `scale(${1 - depth * 0.028})` }}
              >
                <Card {...c} index={i} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DeckHeading() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand">Nº001 — Shipped</p>
        <h2 className="mt-3 text-[clamp(1.7rem,3.4vw,2.9rem)] font-black uppercase leading-[0.95] tracking-[-0.03em]">
          Ten things it does today.
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
}: {
  kicker: string;
  title: string;
  body: string;
  visual: React.ReactNode;
  index: number;
}) {
  return (
    // bg-surface, not from-surface/90 — see note 1 at the top of this file.
    // The min-height is what gives the deck its heft: without it the cards
    // shrink to their copy and the stack reads as a stack of receipts.
    <article className="edge-lit grid min-h-[clamp(260px,32vh,340px)] items-center gap-6 overflow-hidden rounded-2xl border border-line bg-surface p-8 md:grid-cols-[1fr_minmax(0,380px)] md:gap-12">
      <div>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
            Nº{String(index + 1).padStart(3, "0")}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand">{kicker}</span>
        </div>
        <h3 className="mt-4 text-[clamp(1.25rem,2.2vw,1.9rem)] font-bold leading-tight tracking-tight">{title}</h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-fg-muted">{body}</p>
      </div>
      <div className="min-w-0">{visual}</div>
    </article>
  );
}

/* ─── Card visuals ─────────────────────────────────────────────────────────
   Honest mocks of the matching surface. Identifiers, thresholds and numbers
   are the real ones from the cited code — a fake screenshot of a real feature
   is still a fake screenshot. */

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-line bg-canvas/60 p-3.5">{children}</div>;
}

function VisualDuplicate() {
  return (
    <Panel>
      <div className="flex items-center gap-1.5 rounded border border-warning/30 bg-warning/5 px-2 py-1.5">
        <span className="text-[10px] text-warning">●</span>
        <span className="text-[10px] text-fg-muted">2 possible duplicates</span>
      </div>
      {[
        ["Khan Traders", "same phone"],
        ["Khan Traders (Pvt)", "87% similar"],
      ].map(([name, why]) => (
        <div key={name} className="mt-2 flex items-center justify-between gap-2 border-t border-line/70 pt-2">
          <span className="truncate text-[10px] text-fg">{name}</span>
          <span className="shrink-0 font-mono text-[9px] text-fg-subtle">{why}</span>
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
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="font-mono text-[9px] uppercase tracking-wider text-fg-subtle">Score</span>
        <span className="font-mono text-base font-semibold tabular-nums text-brand">82</span>
      </div>
      {parts.map(([label, delta, pct]) => (
        <div key={label} className="mt-1.5 flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-[9px] text-fg-muted">{label}</span>
          <span className="h-1 flex-1 rounded-full bg-elevated">
            <span className="block h-1 rounded-full bg-brand/70" style={{ width: `${pct}%` }} />
          </span>
          <span className="w-7 shrink-0 text-right font-mono text-[9px] tabular-nums text-fg-subtle">{delta}</span>
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
      <div className="flex justify-between pb-2 font-mono text-[9px] uppercase tracking-wider text-fg-subtle">
        <span>SKU</span>
        <span>Cover</span>
      </div>
      {rows.map(([sku, cover, low]) => (
        <div key={sku} className="flex justify-between border-t border-line/70 py-2 text-[10px]">
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
      <div className="flex items-center gap-2">
        <span className="rounded bg-brand-subtle px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-brand">
          In 41 days
        </span>
        <span className="text-[10px] text-fg">Ramadan</span>
      </div>
      {[
        ["Basmati 5kg", "+40%"],
        ["Cooking oil 1L", "+35%"],
      ].map(([sku, lift]) => (
        <div key={sku} className="mt-2 flex justify-between border-t border-line/70 pt-2 text-[10px]">
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
          <p className="font-mono text-[9px] uppercase tracking-wider text-fg-subtle">FBR invoice</p>
          <p className="mt-1 truncate font-mono text-[10px] text-fg">7000007DI16112…</p>
          <p className="mt-2 inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-[9px] text-success">
            ● statusCode 00
          </p>
        </div>
        {/* Stand-in for the QR the real receipt renders (FbrStamp.tsx). */}
        <div className="grid h-12 w-12 shrink-0 grid-cols-4 gap-px rounded-sm bg-fg/90 p-1" aria-hidden>
          {Array.from({ length: 16 }, (_, i) => (
            <span key={i} className={`rounded-[1px] ${i % 3 === 0 || i === 5 || i === 10 ? "bg-surface" : ""}`} />
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
      <p className="pb-2 font-mono text-[9px] uppercase tracking-wider text-fg-subtle">Salaried slabs · 2025-26</p>
      {slabs.map(([band, rate]) => (
        <div key={band} className="flex justify-between border-t border-line/70 py-2 text-[10px]">
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
        <span className="text-[10px] text-brand">✦</span>
        <span className="truncate text-[10px] text-fg-muted">which products are low on stock?</span>
      </div>
      <p className="mt-2.5 text-[10px] leading-relaxed text-fg">
        <span className="font-semibold">4 products</span> are below their reorder point. Basmati 5kg is moving fastest.
      </p>
      <p className="mt-2 truncate font-mono text-[8px] text-fg-subtle">
        select name from ai_v_products where is_low_stock…
      </p>
    </Panel>
  );
}

function VisualRls() {
  return (
    <Panel>
      <p className="font-mono text-[9px] uppercase tracking-wider text-fg-subtle">Tenant B asks for Tenant A</p>
      <p className="mt-2 truncate font-mono text-[9px] text-fg-muted">
        select * from leads where tenant_id = &lsquo;A&rsquo;
      </p>
      <div className="mt-2.5 flex items-center gap-1.5 border-t border-line/70 pt-2.5">
        <span className="text-[10px] text-success">✓</span>
        <span className="font-mono text-[9px] text-success">0 rows — policy, not filter</span>
      </div>
    </Panel>
  );
}

function VisualSections() {
  const rows: [string, boolean][] = [
    ["Sales / CRM", true],
    ["POS & Inventory", true],
    ["Staff / HRMS", false],
  ];
  return (
    <Panel>
      <p className="pb-2 font-mono text-[9px] uppercase tracking-wider text-fg-subtle">Settings · Modules</p>
      {rows.map(([label, on]) => (
        <div key={label} className="flex items-center justify-between border-t border-line/70 py-2 text-[10px]">
          <span className={on ? "text-fg" : "text-fg-subtle"}>{label}</span>
          {/* A switch, drawn — the real control lives in settings/sections. */}
          <span
            className={`flex h-3.5 w-6 shrink-0 items-center rounded-full p-0.5 transition-colors ${
              on ? "justify-end bg-brand" : "justify-start bg-elevated"
            }`}
            aria-hidden
          >
            <span className="h-2.5 w-2.5 rounded-full bg-surface" />
          </span>
        </div>
      ))}
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
      <p className="pb-2 font-mono text-[9px] uppercase tracking-wider text-fg-subtle">A lead is called…</p>
      {map.map(([industry, word]) => (
        <div key={industry} className="flex justify-between border-t border-line/70 py-2 text-[10px]">
          <span className="text-fg-muted">{industry}</span>
          <span className="text-brand">{word}</span>
        </div>
      ))}
    </Panel>
  );
}
