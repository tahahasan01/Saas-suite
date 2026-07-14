"use client";

import { Wordmark } from "@/components/ui";

/* The doorstep: login, signup, forgot, reset, accept-invite, verify.

   Split screen — brand panel left, form right — with three deliberate
   departures from the usual version of this layout:

   1. The panel says something TRUE and specific. The genre default is a mood
      line ("Your path to financial sovereignty") that could sit on any product
      in any category. These are three shipped capabilities a competitor would
      have to build. Someone on the sign-in screen is either about to trust you
      with their books or trying to remember a password — neither is moved by
      atmosphere.
   2. The form is optically centred and stays centred. The common failure is
      `items-center` on a container that isn't full height, which parks the card
      above the midpoint with a lake of empty under it.
   3. It's theme-aware. The panel stays dark on purpose in both themes — it's a
      brand surface, and it gives the light theme somewhere for the glow to
      live — but the form side follows the toggle.

   Lives here rather than a route-group layout because the auth pages sit at the
   top level (app/login, app/signup, …) next to the landing page, so a shared
   layout there would wrap the marketing page too.

   The app itself deliberately does NOT get this treatment: a POS billing screen
   is a tool used all day in a bright room, and atmosphere behind a receipt line
   is noise. */

// Magenta bloom from the lower-left, matching the homepage hero's light source.
const PANEL: React.CSSProperties = {
  background: `
    radial-gradient(52rem 38rem at 12% 104%, rgba(255, 77, 157, 0.38), transparent 64%),
    radial-gradient(38rem 30rem at 88% -8%, rgba(194, 24, 91, 0.22), transparent 60%),
    #08080a`,
};

// Every line is a shipped capability, cited so it can't quietly rot into a lie.
const PROOF: [string, string][] = [
  ["Invoices filed with FBR", "Real transmission to the PRAL gateway — and it retries itself if the line drops."],
  ["Payroll on the 2025-26 slabs", "Six salaried brackets, applied to pay that attendance already adjusted."],
  ["Isolated by Postgres itself", "Row-level security on every table, not a WHERE clause someone has to remember."],
];

export function AuthShell({
  eyebrow,
  children,
  width = "sm",
}: {
  /** Small mono label between the rules — "Sign in", "Create account". */
  eyebrow: string;
  children: React.ReactNode;
  /** `sm` for single-field forms; `lg` for signup, which is a real form. */
  width?: "sm" | "lg";
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,44%)_1fr]">
      {/* ── Brand panel ── hidden below lg: on a phone it would push the form
          below the fold, and the form is the entire reason anyone is here. */}
      <aside
        style={PANEL}
        className="theme-dark theme-marketing relative hidden flex-col justify-between overflow-hidden p-12 lg:flex"
      >
        <Wordmark />

        <div>
          <h2 className="max-w-md text-[clamp(1.75rem,2.6vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-fg">
            Sales, stock and staff.{" "}
            <span className="text-brand">One login.</span>
          </h2>

          <ul className="mt-9 max-w-md space-y-5">
            {PROOF.map(([title, body]) => (
              <li key={title} className="flex gap-3.5">
                <span
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand/15 text-[10px] text-brand ring-1 ring-brand/30"
                  aria-hidden
                >
                  ✓
                </span>
                <div>
                  <p className="text-sm font-medium text-fg">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-fg-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-subtle">
          Built for Pakistan · PKR · CNIC · FBR
        </p>
      </aside>

      {/* ── Form side ── min-h-screen on the *child* of a grid cell, so it is
          genuinely full height and `items-center` centres against the viewport
          rather than against the content. */}
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <div className={`w-full ${width === "lg" ? "max-w-2xl" : "max-w-sm"}`}>
          {/* The panel carries the wordmark on desktop; on mobile it's gone, so
              the form side has to. */}
          <div className="flex justify-center lg:hidden">
            <Wordmark />
          </div>

          <div className="mt-6 flex items-center gap-4 lg:mt-0">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-line-strong" />
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-subtle">{eyebrow}</span>
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-line-strong" />
          </div>

          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
