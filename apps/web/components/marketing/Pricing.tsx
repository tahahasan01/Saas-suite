"use client";

import Link from "next/link";
import { Reveal } from "./Reveal";

/* Replaces the old "five reasons it's one bill" rows, which restated three
   cards the deck had already dealt (AI reach, RLS isolation, industry
   re-skinning) — the section read as filler because it was.

   The page's actual gap was a price. This is it, and it is the real one:
   figures mirror PLANS in services/api/app/billing.py (price_minor is paisa,
   so 250_000 → Rs 2,500). Limits are stated rather than buried — the seat cap
   is enforced by check_seat_limit with a 403, so a visitor who plans around
   "unlimited" finds out at the worst possible moment.

   If billing.py changes, this changes. Keep them in the same commit. */

type Plan = {
  name: string;
  price: string;
  cadence: string;
  pitch: string;
  limits: string[];
  featured?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Starter",
    price: "Rs 2,500",
    cadence: "/ month",
    pitch: "One module, priced for a single counter.",
    limits: ["1 module of the three", "Up to 5 people", "100 AI questions a month", "FBR invoicing included"],
  },
  {
    name: "Growth",
    price: "Rs 6,000",
    cadence: "/ month",
    pitch: "All three modules, wired together. What your trial runs on.",
    limits: ["All 3 modules", "Up to 20 people", "1,000 AI questions a month", "FBR invoicing included"],
    featured: true,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="bloom border-y border-line/60">
      <div className="mx-auto max-w-[1100px] px-6 py-20">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand">Nº003 — Pricing</p>
              <h2 className="mt-3 text-[clamp(1.7rem,3.4vw,2.9rem)] font-black uppercase leading-[0.95] tracking-[-0.03em]">
                One bill.<br />Two numbers.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-fg-muted">
              Flat monthly rates in rupees — not a per-seat charge that bills you for hiring. Seat caps are listed,
              not buried.
            </p>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {PLANS.map((p, i) => (
            <Reveal key={p.name} delay={i * 110}>
              <PlanCard {...p} />
            </Reveal>
          ))}
        </div>

        <Reveal delay={220}>
          <div className="edge-lit mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface/60 p-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">Enterprise</p>
              <p className="mt-1.5 text-sm text-fg-muted">
                More than 20 people, or limits that need to be yours. We&apos;ll quote it.
              </p>
            </div>
            <Link
              href="/pricing"
              className="rounded-xl border border-line px-6 py-3 text-sm font-medium text-fg transition hover:border-line-strong"
            >
              Talk to us
            </Link>
          </div>
        </Reveal>

        {/* The payment reality, stated up front rather than discovered at
            checkout: there is no card gateway wired yet (billing.py:2-3), so
            promising one here would be a lie a buyer finds out about late. */}
        <Reveal delay={280}>
          <p className="mt-6 text-center text-xs leading-relaxed text-fg-subtle">
            14 days free, at Growth level — no card, because there&apos;s no card to take. Pay by bank transfer to
            Meezan with your reference code; your workspace activates once it clears.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function PlanCard({ name, price, cadence, pitch, limits, featured }: Plan) {
  return (
    <div
      className={`edge-lit flex h-full flex-col rounded-2xl border p-7 transition-colors ${
        featured
          ? "border-brand/40 bg-gradient-to-b from-brand-subtle/50 to-brand-subtle/10"
          : "border-line bg-surface/60"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className={`font-mono text-[11px] uppercase tracking-[0.18em] ${featured ? "text-brand" : "text-fg-subtle"}`}>
          {name}
        </p>
        {featured && (
          <span className="rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-semibold text-brand-fg">
            Your trial runs this
          </span>
        )}
      </div>

      <p className="mt-4 flex items-baseline gap-1.5">
        <span className="text-[clamp(2rem,3.6vw,2.8rem)] font-black tracking-[-0.03em] tabular-nums">{price}</span>
        <span className="text-sm text-fg-subtle">{cadence}</span>
      </p>
      <p className="mt-2 text-sm text-fg-muted">{pitch}</p>

      <ul className="mt-6 space-y-2.5 border-t border-line pt-5 text-sm">
        {limits.map((l) => (
          <li key={l} className="flex gap-2.5 text-fg-muted">
            <span className={featured ? "text-brand" : "text-success"}>✓</span>
            {l}
          </li>
        ))}
      </ul>

      {/* mt-auto on the wrapper, not the Link: the two plans carry different
          numbers of limits, and this is what keeps both buttons on one line. */}
      <div className="mt-auto pt-7">
        <Link
          href="/signup"
          className={`block rounded-xl px-6 py-3 text-center text-sm font-semibold transition ${
            featured
              ? "bg-brand text-brand-fg hover:bg-brand-hover"
              : "border border-line text-fg hover:border-line-strong"
          }`}
        >
          Start free
        </Link>
      </div>
    </div>
  );
}
