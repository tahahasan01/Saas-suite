"use client";

import Link from "next/link";
import { useSession } from "@/lib/session";
import { Wordmark } from "@/components/ui";
import { RotatingWord } from "@/components/marketing/RotatingWord";
import { HeroCanvas } from "@/components/marketing/HeroCanvas";
import { ProductShot } from "@/components/marketing/ProductShot";
import { Reveal } from "@/components/marketing/Reveal";
import { Marquee } from "@/components/marketing/Marquee";
import { ScrollGallery } from "@/components/marketing/ScrollGallery";
import { ScrubWords } from "@/components/marketing/ScrubWords";
import { ScrollRows } from "@/components/marketing/ScrollRows";
import { Testimonials } from "@/components/marketing/Testimonials";

// Every entry here must be something the product actually does today. If it
// isn't shipped, it doesn't go on the marquee.
const CAPABILITIES = [
  "Lead scoring", "Duplicate detection", "Barcode billing", "Restock forecasting",
  "Seasonal demand forecast", "FBR payroll tax", "Invoice PDFs", "Ask-your-data AI",
  "Row-level tenant isolation", "Workflow automations", "Industry re-skin", "Bank transfer billing",
];

export default function Landing() {
  const { me } = useSession();

  return (
    // Composed dark on purpose — the marketing surface keeps its own scheme
    // regardless of the app's light/dark toggle.
    <div className="theme-dark theme-marketing min-h-screen bg-canvas text-fg">
      <header className="sticky top-0 z-30 border-b border-line/60 bg-canvas/70 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Wordmark />
          <nav className="flex items-center gap-6 text-sm">
            <a href="#modules" className="hidden text-fg-muted hover:text-fg sm:block">Product</a>
            <a href="#industries" className="hidden text-fg-muted hover:text-fg sm:block">Industries</a>
            <Link href="/pricing" className="hidden text-fg-muted hover:text-fg sm:block">Pricing</Link>
            {me ? (
              <Link href="/dashboard" className="rounded-lg bg-brand px-4 py-1.5 font-medium text-brand-fg hover:bg-brand-hover">Dashboard</Link>
            ) : (
              <>
                <Link href="/login" className="text-fg-muted hover:text-fg">Sign in</Link>
                <Link href="/signup" className="rounded-lg bg-brand px-4 py-1.5 font-medium text-brand-fg hover:bg-brand-hover">Start free</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* ─── Hero ─────────────────────────────────────────────────────────────
          Type-first and centred: at this scale the headline *is* the artwork, so
          nothing else competes with it. Light bleeds in from the corners and out
          from behind the glyphs. */}
      <section className="bleed grid-lines relative isolate overflow-hidden">
        <div className="mx-auto flex min-h-[86vh] max-w-6xl flex-col items-center justify-center px-6 py-20 text-center">
          <span className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-3 py-1 text-xs text-fg-muted backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> One platform · CRM · POS · HRMS
          </span>

          {/* The connector line stays small and sentence-case: it keeps the two
              shout-lines from wrapping, and reads as a breath between them. */}
          <h1 className="animate-fade-up mt-7" style={{ animationDelay: "80ms" }}>
            <span className="block text-[clamp(2.3rem,6.6vw,5.25rem)] font-black uppercase leading-[0.92] tracking-[-0.035em]">
              Run your whole business
            </span>
            <span className="mt-3 block text-base font-medium text-fg-muted sm:text-lg">
              in one app that calls them
            </span>
            <span className="text-glow mt-2 block text-[clamp(2.3rem,6.6vw,5.25rem)] font-black uppercase leading-[0.92] tracking-[-0.035em]">
              <RotatingWord />
            </span>
          </h1>

          <p
            className="animate-fade-up mt-7 max-w-xl text-base leading-relaxed text-fg-muted"
            style={{ animationDelay: "160ms" }}
          >
            Sales, billing and staff in one system — localized to your industry, with an AI that
            answers questions about your own data. Built for Pakistan: PKR, CNIC, FBR tax.
          </p>

          <div className="animate-fade-up mt-9 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "240ms" }}>
            <Link href="/signup" className="rounded-xl bg-brand px-7 py-3.5 text-sm font-semibold text-brand-fg shadow-lg shadow-brand/25 transition hover:bg-brand-hover">
              Start free — 14 days
            </Link>
            <Link href="/pricing" className="rounded-xl border border-line px-7 py-3.5 text-sm font-medium text-fg transition hover:border-line-strong">
              See pricing
            </Link>
          </div>
          <p className="animate-fade-up mt-4 text-xs text-fg-subtle" style={{ animationDelay: "320ms" }}>
            No card required · Flat PKR pricing, not per-seat
          </p>

          <a
            href="#modules"
            aria-label="Scroll to product"
            className="animate-fade-in mt-16 grid h-10 w-10 place-items-center rounded-full border border-line text-fg-subtle transition hover:border-line-strong hover:text-fg"
            style={{ animationDelay: "600ms" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </a>
        </div>

        {/* Factual product substance — not invented customer counts. */}
        <div className="mx-auto max-w-6xl border-t border-line/60 px-6">
          <dl className="grid grid-cols-2 gap-6 py-8 sm:grid-cols-4">
            {[
              ["3", "modules, one login"],
              ["7", "industries, re-skinned"],
              // "Every screen" overstated it — there's one /ai/ask endpoint and
              // one prompt component. The stronger true claim is the reach: one
              // question spans CRM, POS and HRMS via the ai_v_* views.
              ["1", "AI, across all three modules"],
              // NOT "unlimited seats" — billing.py caps starter at 5 and growth
              // at 20, and check_seat_limit returns 403 at the cap. The FAQ
              // below has always said this correctly; the tile used to contradict
              // both it and the code.
              ["PKR", "flat pricing, not per-seat"],
            ].map(([v, l], i) => (
              <Reveal key={l} delay={i * 70}>
                <dt className="text-2xl font-semibold tracking-tight text-fg">{v}</dt>
                <dd className="mt-0.5 text-xs text-fg-muted">{l}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      {/* ─── Capability marquee ───────────────────────────────────────────── */}
      <section className="border-y border-line/60 bg-surface/20 py-5">
        <Marquee items={CAPABILITIES} />
      </section>

      {/* ─── Product shot ─────────────────────────────────────────────────── */}
      <section className="bloom">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-brand">One screen, every side of the business</p>
            {/* Was "A won deal moves your stock. Nobody re-types anything." —
                no code does that. Stock is written by POS sales and returns
                only. What IS true is the read side: one dashboard, and one AI
                question, spanning all three modules. */}
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              Sales, stock and staff. One dashboard, one question away.
            </h2>
            <p className="mt-4 text-fg-muted">
              Because it&apos;s one system — not three apps taped together — the dashboard reads sales,
              inventory and staff at once.
            </p>
          </Reveal>
          <Reveal delay={120} className="mt-10">
            <ProductShot />
          </Reveal>
        </div>
      </section>

      {/* ─── Modules ──────────────────────────────────────────────────────── */}
      <section id="modules" className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_460px]">
          <Reveal>
            <p className="text-sm font-medium text-brand">Three tools. One login. One AI.</p>
            <h2 className="mt-2 text-[clamp(1.75rem,3.4vw,2.6rem)] font-bold leading-[1.05] tracking-tight">
              Activate only what you need — the rest stays out of your way.
            </h2>
            <p className="mt-4 max-w-md text-fg-muted">
              One core, three modules, wired together. Turn one off and it leaves the nav entirely —
              turn it back on and its data is exactly where you left it.
            </p>
          </Reveal>

          {/* One core, three orbiting modules — the thesis, rendered. */}
          <div className="relative h-[300px] sm:h-[380px]">
            <HeroCanvas />
          </div>
        </div>
      </section>

      {/* The module cards that used to sit here are now the pinned rail below:
          same five surfaces, but scrubbed through one at a time instead of
          skimmed as a grid. */}
      <ScrollGallery />

      {/* ─── The thesis ───────────────────────────────────────────────────── */}
      {/* Lands once, in full colour, straight after the rail — the page has
          just shown five surfaces, and this is the sentence that says why
          they're one purchase. */}
      {/* The payoff line is "one question can cross all three" — which is
          shipped (ai_v_* views span CRM/POS/HRMS, section-scoped and guarded).
          It is NOT "the won deal already moved your stock": nothing in crm.py
          writes stock_qty, and the workflow engine's only action is `notify`.
          Keep this sentence pinned to what the code does. */}
      <ScrubWords
        kicker="Nº002 — The thesis"
        text="Three apps means three bills, three logins, and a spreadsheet in the middle where the truth goes missing. One system means one question can cross all three."
      />

      {/* ─── How it works ─────────────────────────────────────────────────── */}
      <section className="border-y border-line/60 bg-surface/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Reveal>
            <h2 className="max-w-xl text-3xl font-semibold tracking-tight">Live in an afternoon, not a quarter.</h2>
          </Reveal>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              ["Pick your industry", "Choose Retail, Pharmacy, Restaurant or one of seven. Every label in the app changes to match how you already talk."],
              ["Turn on what you need", "Sales, POS, Staff — on or off. Off means gone: no clutter, no upsell nag, no paying for it."],
              ["Start with real data", "Your workspace opens with a working example already inside, so you learn by editing, not by reading a manual."],
            ].map(([title, body], i) => (
              <Reveal key={title} delay={i * 110}>
                <li className="relative border-t border-line pt-4">
                  <span className="font-mono text-sm text-brand">0{i + 1}</span>
                  <h3 className="mt-2 text-base font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{body}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ─── Industries ───────────────────────────────────────────────────── */}
      <section id="industries" className="mx-auto max-w-6xl px-6 py-20">
        <Reveal className="max-w-xl">
          <p className="text-sm font-medium text-brand">It speaks your trade</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">The same software. Seven vocabularies.</h2>
          <p className="mt-4 text-fg-muted">
            A school has students, not leads. A clinic has patients. Business OS re-skins itself at signup —
            the screens, the words, the forms.
          </p>
        </Reveal>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            // These pairs must match seed.py's terminology rows exactly — they
            // are a promise about words the app will actually show. Real estate
            // seeds lead→Buyer; "Prospect" appeared nowhere in the product.
            ["Retail", "Customer"], ["Restaurant", "Guest"], ["Pharmacy", "Patient"], ["Wholesale", "Buyer"],
            ["Education", "Student"], ["Software house", "Client"], ["Real estate", "Buyer"],
          ].map(([industry, word], i) => (
            <Reveal key={industry} delay={i * 60}>
              <div className="edge-lit group rounded-xl border border-line bg-gradient-to-b from-surface/80 to-surface/40 p-4 transition hover:border-brand/40">
                <p className="text-sm font-medium">{industry}</p>
                <p className="mt-1 text-xs text-fg-subtle">calls a lead a <span className="text-brand">{word}</span></p>
              </div>
            </Reveal>
          ))}
          <Reveal delay={420}>
            <Link href="/signup" className="grid h-full place-items-center rounded-xl border border-dashed border-line p-4 text-sm text-fg-muted transition hover:border-brand/40 hover:text-fg">
              Yours next →
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ─── Comparison ───────────────────────────────────────────────────── */}
      {/* The two-column ✕/✓ table that used to make this argument is now the
          pinned rows below — the same five points, but arriving one at a time
          so each one is actually read. */}
      <ScrollRows />

      {/* ─── Customers ────────────────────────────────────────────────────── */}
      {/* Placeholder content — see the note in Testimonials.tsx. Real quotes
          and logos, or this section comes out before launch. */}
      <Testimonials />

      {/* ─── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-tight">Questions, answered</h2>
        </Reveal>
        <div className="mt-8 divide-y divide-line border-y border-line">
          {[
            ["Do I have to use all three modules?",
             "No. You pick at signup and change any time in Settings. A module that's off is gone from the nav, and its data stays untouched if you turn it back on."],
            ["Is my data separate from other businesses?",
             "Yes — enforced by the database itself, not just app code. Every row is tagged to your workspace and Postgres row-level security blocks cross-tenant reads even if a query tried."],
            ["What does it cost per user?",
             "Nothing. Pricing is a flat monthly rate in PKR per workspace, with seat limits by plan — not a per-seat charge that punishes you for growing."],
            // Do not restore the old answer ("POS is designed to keep billing
            // during a drop and sync when the line returns") without building
            // it first: there is no service worker, no local queue and no sync
            // reconciliation anywhere in apps/web. FBR store-and-forward is
            // real, but it is server-side and a different promise.
            ["Does it work on slow or patchy internet?",
             "Honestly: POS needs a connection to bill today — offline billing is on the roadmap, not in the product. What is built is FBR store-and-forward: if the tax gateway is unreachable, your sale still completes and the invoice files itself later."],
            ["Can I pay by bank transfer?",
             "Yes. Card isn't required — bank transfer is a first-class option, because that's how business actually gets paid here."],
          ].map(([q, a]) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
                {q}
                <span className="shrink-0 text-fg-subtle transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────────────────── */}
      <section className="atmosphere">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-4xl font-semibold tracking-tight">Your business, finally in one place.</h2>
          <p className="mx-auto mt-4 max-w-md text-fg-muted">Set up in minutes. No manual required — the AI does the busywork.</p>
          <Link href="/signup" className="mt-8 inline-block rounded-xl bg-brand px-8 py-3.5 text-sm font-semibold text-brand-fg shadow-lg shadow-brand/20 transition hover:bg-brand-hover">
            Create your workspace
          </Link>
        </div>
      </section>

      <footer className="border-t border-line/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-fg-subtle sm:flex-row">
          <Wordmark />
          <span>© 2026 Business OS · Built for Pakistan 🇵🇰</span>
        </div>
      </footer>
    </div>
  );
}

