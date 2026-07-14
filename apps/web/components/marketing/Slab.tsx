"use client";

import { Reveal } from "./Reveal";

/* The one saturated slab on an otherwise near-black (or white) page. It exists
   to break the scroll: colour this loud, arriving once, is what makes the
   sections either side read as chapters rather than as more of the same. Flat
   fill on purpose — a gradient would soften the exact edge doing the work.

   This used to scrub word-by-word against scroll position (ScrubWords). It's
   gone: at any given scroll offset most of the sentence sat dimmed, so the page
   showed two-thirds of its own thesis as grey smear. A statement this short is
   the payoff line — it wants to be read at a glance, not decoded a word at a
   time. The section keeps a single fade-up on entry and nothing scroll-linked,
   which also takes 220vh of pinned height off the page.

   Measure matches the deck and pricing (1100px) so the three read as one column. */

const SLAB: React.CSSProperties = { background: "#3f37d6" };

export function Slab({ kicker, text }: { kicker: string; text: string }) {
  return (
    <section style={SLAB}>
      <div className="mx-auto max-w-[1100px] px-6 py-28">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/70">{kicker}</p>
          <p className="mt-6 text-[clamp(1.7rem,3.8vw,3.2rem)] font-bold leading-[1.15] tracking-[-0.025em] text-white">
            {text}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
