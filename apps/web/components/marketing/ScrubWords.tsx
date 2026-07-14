"use client";

import { useReducedMotion, useScrollProgress } from "./useScrollProgress";

/* A paragraph that is read *to* you: each word lifts out of the dim as the
   scroll passes over it. Pinned, so the reader's pace and the sentence's pace
   are the same thing.

   Words carry `dim` state via opacity only — the text is fully present in the
   DOM and to a screen reader from the start; this is decoration on top of
   something already legible, not a gate in front of it. */

/* The one saturated slab on an otherwise near-black page. It exists to break
   the scroll: colour this loud, arriving once, is what makes the sections
   either side read as chapters rather than as more of the same. Kept as a flat
   fill — a gradient here would soften exactly the edge that does the work. */
const SLAB: React.CSSProperties = { background: "#3f37d6" };

export function ScrubWords({ text, kicker }: { text: string; kicker: string }) {
  const { ref, progress } = useScrollProgress<HTMLElement>();
  const reduced = useReducedMotion();
  const words = text.split(" ");

  // Overshoot: without it the tail of the sentence is still dim at the moment
  // the section releases, and the payoff word never lands.
  const lit = progress * words.length * 1.25;

  if (reduced) {
    return (
      <section style={SLAB}>
        <div className="mx-auto max-w-5xl px-6 py-24">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand-fg/70">{kicker}</p>
          <p className="mt-6 text-[clamp(1.6rem,4vw,3rem)] font-bold leading-[1.15] tracking-[-0.02em] text-brand-fg">
            {text}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} style={{ ...SLAB, height: "220vh" }}>
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="mx-auto max-w-5xl px-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand-fg/70">{kicker}</p>
          <p className="mt-6 text-[clamp(1.6rem,4vw,3rem)] font-bold leading-[1.15] tracking-[-0.02em]">
            {words.map((w, i) => (
              <span
                key={`${w}-${i}`}
                className="text-brand-fg transition-opacity duration-200 ease-out"
                style={{ opacity: Math.min(1, Math.max(0.16, lit - i)) }}
              >
                {w}{i < words.length - 1 ? " " : ""}
              </span>
            ))}
          </p>
        </div>
      </div>
    </section>
  );
}
