"use client";

/* Two review rows travelling in opposite directions. The counter-motion is the
   point: a single drifting row reads as a banner and gets ignored, where two
   crossing rows read as volume — a lot of people saying a lot of things.
   Reuses the existing `marquee` keyframes; the lower row just runs reversed.

   ── BEFORE THIS SHIPS ────────────────────────────────────────────────────
   Every entry below is a PLACEHOLDER, written in brackets so it cannot be
   mistaken for copy. Replace with real, attributable quotes you have written
   permission to use, or delete the section.

   This page already holds itself to that rule ("factual product substance —
   not invented customer counts"). Fabricated reviews would also be an
   unfair-trade-practice problem in most markets, not just an honesty one.
   Empty arrays render nothing, so shipping with these cleared is safe.
   ───────────────────────────────────────────────────────────────────────── */

type Review = { quote: string; name: string; role: string };

const REVIEWS: Review[] = [
  { quote: "[ Replace: what changed for them, in one concrete sentence ]", name: "[ Name ]", role: "[ Role, Company — Dubai ]" },
  { quote: "[ Replace: the objection they had before buying, and what answered it ]", name: "[ Name ]", role: "[ Role, Company — London ]" },
  { quote: "[ Replace: a number they can stand behind — hours, currency, headcount ]", name: "[ Name ]", role: "[ Role, Company — Toronto ]" },
  { quote: "[ Replace: the thing they expected to be hard that wasn't ]", name: "[ Name ]", role: "[ Role, Company — Riyadh ]" },
  { quote: "[ Replace: what they'd tell a peer in their own trade ]", name: "[ Name ]", role: "[ Role, Company — Singapore ]" },
  { quote: "[ Replace: why they stopped using the tool they used before ]", name: "[ Name ]", role: "[ Role, Company — New York ]" },
];

/** Customer wordmarks. Text, not images, until you have real logo files and
 *  written permission to display them — a logo shown without it is a
 *  trademark problem on top of a truthfulness one. */
const CUSTOMERS: string[] = [
  "[ Customer — UAE ]",
  "[ Customer — UK ]",
  "[ Customer — KSA ]",
  "[ Customer — Canada ]",
  "[ Customer — Singapore ]",
  "[ Customer — USA ]",
];

export function Testimonials() {
  // Nothing to say → say nothing. Better an absent section than an empty one
  // with a heading promising reviews that aren't there.
  if (!REVIEWS.length) return null;

  const half = Math.ceil(REVIEWS.length / 2);
  const rows = [REVIEWS.slice(0, half), REVIEWS.slice(half)];

  return (
    <section className="bloom overflow-hidden py-20" aria-label="Customers">
      <div className="mx-auto max-w-6xl px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand">Nº004 — Customers</p>
        <h2 className="mt-3 max-w-2xl text-[clamp(1.9rem,4.4vw,3.4rem)] font-black uppercase leading-[0.95] tracking-[-0.03em]">
          Run by people<br />who don&apos;t do software.
        </h2>
      </div>

      {CUSTOMERS.length > 0 && (
        <div className="mx-auto mt-10 max-w-6xl px-6">
          <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
            {CUSTOMERS.map((c) => (
              <li
                key={c}
                className="grid h-16 place-items-center bg-canvas px-3 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-fg-subtle transition-colors hover:text-fg"
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Rows are decorative motion around content that is already in the DOM
          above the fold of a screen reader's pass — hence aria-hidden on the
          duplicate copy only, not the row itself. */}
      <div
        className="group mt-8 space-y-4"
        style={{ maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)" }}
      >
        {rows.map((row, r) => (
          <ul
            key={r}
            className="animate-marquee flex w-max gap-4 group-hover:[animation-play-state:paused]"
            style={{
              animationDirection: r === 1 ? "reverse" : "normal",
              // Different durations stop the two rows from locking into a
              // visible shared rhythm.
              animationDuration: r === 1 ? "58s" : "46s",
            }}
          >
            {[...row, ...row].map((rev, i) => (
              <li key={i} aria-hidden={i >= row.length}>
                <ReviewCard {...rev} />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  );
}

function ReviewCard({ quote, name, role }: Review) {
  return (
    <figure className="edge-lit flex h-full w-[min(84vw,380px)] flex-col rounded-2xl border border-line bg-gradient-to-b from-surface/90 to-surface/40 p-5">
      <div className="flex gap-0.5 text-brand" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="text-[11px]">
            ★
          </span>
        ))}
      </div>
      <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-fg">{quote}</blockquote>
      <figcaption className="mt-4 flex items-center gap-2.5 border-t border-line pt-3.5">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-subtle font-mono text-[9px] text-brand ring-1 ring-brand/20"
          aria-hidden
        >
          ★
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold text-fg">{name}</span>
          <span className="block truncate text-[11px] text-fg-subtle">{role}</span>
        </span>
      </figcaption>
    </figure>
  );
}
