"use client";

import { useReducedMotion, useScrollProgress } from "./useScrollProgress";

/* Numbered rows that open one at a time as the scroll advances — the section
   holds while the reader moves through the list, so the argument arrives in
   order instead of all at once.

   Only the open row carries its body copy. That is the whole point: five
   claims side by side is a wall nobody reads; five headlines with one of them
   explaining itself is a sequence. */

const ROWS: [string, string][] = [
  [
    "Flat PKR pricing",
    "One monthly rate per workspace, in rupees. Seats are capped by plan, not billed by the head — growing the team never re-opens the pricing conversation.",
  ],
  [
    "One login, three modules",
    "Sales, POS and Staff share a core. Switch one off and it leaves the nav entirely; switch it back on and its data is exactly where you left it.",
  ],
  [
    "Speaks your trade",
    "A school has students, a clinic has patients, a shop has customers. Pick your industry at signup and every label, screen and form follows.",
  ],
  [
    "One AI, all three modules",
    "Ask in plain language and it writes the SQL, runs it read-only, and answers from your workspace only. It reads across sales, stock and staff in a single question — and with no API key it says so, rather than inventing an answer.",
  ],
  [
    "Isolated by the database",
    "Row-level security in Postgres, not a WHERE clause someone has to remember. A cross-tenant read fails at the engine even if a query asked for one.",
  ],
];

export function ScrollRows() {
  const { ref, progress } = useScrollProgress<HTMLElement>();
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <section className="border-y border-line/60 bg-surface/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <RowsHeading />
          <ol className="mt-10 divide-y divide-line border-y border-line">
            {ROWS.map(([title, body], i) => (
              <li key={title} className="grid gap-2 py-6 md:grid-cols-[5rem_1fr_1fr]">
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
                  Nº{String(i + 1).padStart(3, "0")}
                </span>
                <h3 className="text-2xl font-bold tracking-tight">{title}</h3>
                <p className="text-sm leading-relaxed text-fg-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    );
  }

  // Each row owns an equal slice of the range; the last slice is clamped so the
  // fifth row stays open through the section's release instead of flicking shut.
  const active = Math.min(ROWS.length - 1, Math.floor(progress * ROWS.length));

  return (
    <section
      ref={ref}
      className="border-y border-line/60 bg-surface/30"
      style={{ height: `${ROWS.length * 70 + 100}vh` }}
      aria-label="Why Business OS"
    >
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden">
        <div className="mx-auto w-full max-w-6xl px-6">
          <RowsHeading />

          <ol className="mt-10 border-t border-line">
            {ROWS.map(([title, body], i) => {
              const open = i === active;
              return (
                <li key={title} className="border-b border-line">
                  <div
                    className={`grid grid-cols-[3.5rem_1fr] items-baseline gap-4 transition-all duration-500 ease-out sm:grid-cols-[5rem_1fr] ${
                      open ? "py-5" : "py-3.5"
                    }`}
                  >
                    <span
                      className={`font-mono text-[11px] uppercase tracking-[0.18em] transition-colors duration-500 ${
                        open ? "text-brand" : "text-fg-subtle"
                      }`}
                    >
                      Nº{String(i + 1).padStart(3, "0")}
                    </span>
                    <div>
                      <h3
                        className={`font-bold tracking-tight transition-all duration-500 ease-out ${
                          open
                            ? "text-[clamp(1.5rem,3.4vw,2.6rem)] text-fg"
                            : "text-[clamp(1.1rem,2.2vw,1.6rem)] text-fg-subtle"
                        }`}
                      >
                        {title}
                      </h3>

                      {/* Grid-rows 0fr→1fr collapses to exactly the copy's own
                          height — no magic max-height to out-grow on a narrow
                          screen and clip the last line. */}
                      <div
                        className="grid transition-all duration-500 ease-out"
                        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
                      >
                        <p className="overflow-hidden text-sm leading-relaxed text-fg-muted">
                          <span className="block max-w-lg pt-2.5">{body}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

function RowsHeading() {
  return (
    <>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand">Nº003 — Why not three apps</p>
      <h2 className="mt-3 max-w-2xl text-[clamp(1.9rem,4.4vw,3.4rem)] font-black uppercase leading-[0.95] tracking-[-0.03em]">
        Five reasons<br />it&apos;s one bill.
      </h2>
    </>
  );
}
