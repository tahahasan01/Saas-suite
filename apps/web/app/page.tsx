"use client";

import Link from "next/link";
import { useSession } from "@/lib/session";
import { Wordmark } from "@/components/ui";
import { RotatingWord } from "@/components/marketing/RotatingWord";
import { HeroCanvas } from "@/components/marketing/HeroCanvas";

export default function Landing() {
  const { me } = useSession();

  return (
    // Composed dark on purpose — the marketing surface keeps its own scheme
    // regardless of the app's light/dark toggle.
    <div className="theme-dark min-h-screen bg-canvas text-fg">
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

      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <section className="atmosphere overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-6 pb-16 pt-16 lg:grid-cols-[1.05fr_1fr] lg:pb-24 lg:pt-24">
          <div>
            <span className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-3 py-1 text-xs text-fg-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> One platform · CRM · POS · HRMS
            </span>
            <h1 className="animate-fade-up mt-5 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl" style={{ animationDelay: "80ms" }}>
              Run your whole business,<br />
              in one app that calls them{" "}
              <RotatingWord />.
            </h1>
            <p className="animate-fade-up mt-5 max-w-lg text-base leading-relaxed text-fg-muted" style={{ animationDelay: "160ms" }}>
              The all-in-one, AI-powered operating system for your business. Sales, billing, and staff —
              localized to your industry, automated by AI, and built WhatsApp-first for Pakistan.
            </p>
            <div className="animate-fade-up mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "240ms" }}>
              <Link href="/signup" className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-brand-fg shadow-lg shadow-brand/20 transition hover:bg-brand-hover">
                Start free — 14 days
              </Link>
              <Link href="/pricing" className="rounded-xl border border-line px-6 py-3 text-sm font-medium text-fg hover:border-line-strong">
                See pricing
              </Link>
            </div>
            <p className="animate-fade-up mt-4 text-xs text-fg-subtle" style={{ animationDelay: "320ms" }}>
              No card required · Flat PKR pricing, not per-seat
            </p>
          </div>

          {/* The thesis, rendered: one core, three modules, all wired together. */}
          <div className="animate-fade-in relative h-[340px] sm:h-[420px] lg:h-[520px]" style={{ animationDelay: "300ms" }}>
            <HeroCanvas />
          </div>
        </div>

        {/* Factual product substance — not invented customer counts. */}
        <div className="mx-auto max-w-6xl border-t border-line/60 px-6">
          <dl className="grid grid-cols-2 gap-6 py-8 sm:grid-cols-4">
            {[
              ["3", "modules, one login"],
              ["7", "industries, re-skinned"],
              ["1", "AI across every screen"],
              ["PKR", "flat pricing, unlimited seats"],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="text-2xl font-semibold tracking-tight text-fg">{v}</dt>
                <dd className="mt-0.5 text-xs text-fg-muted">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ─── Product shot ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-brand">One screen, every side of the business</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            A won deal moves your stock. Nobody re-types anything.
          </h2>
          <p className="mt-4 text-fg-muted">
            Because it&apos;s one system — not three apps taped together — the dashboard reads sales,
            inventory and staff at once.
          </p>
        </div>
        <div className="animate-float mt-12">
          <AppPreview />
        </div>
      </section>

      {/* ─── Modules ──────────────────────────────────────────────────────── */}
      <section id="modules" className="mx-auto max-w-6xl px-6 py-20">
        <p className="text-sm font-medium text-brand">Three tools. One login. One AI.</p>
        <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight">Activate only what you need — the rest stays out of your way.</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <Module icon={<IconCrm />} title="Sales / CRM"
                  desc="Kanban pipeline, AI lead scoring, duplicate detection, and invoicing that flows to accounts." />
          <Module icon={<IconPos />} title="POS & Inventory"
                  desc="Keyboard-fast billing, barcode scan, and AI that tells you what to restock before Eid." />
          <Module icon={<IconHr />} title="Staff / HRMS"
                  desc="Attendance with anti-fraud GPS checks, leave approvals, and payroll with FBR tax." />
        </div>
      </section>

      {/* ─── How it works ─────────────────────────────────────────────────── */}
      <section className="border-y border-line/60 bg-surface/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="max-w-xl text-3xl font-semibold tracking-tight">Live in an afternoon, not a quarter.</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              ["Pick your industry", "Choose Retail, Pharmacy, Restaurant or one of seven. Every label in the app changes to match how you already talk."],
              ["Turn on what you need", "Sales, POS, Staff — on or off. Off means gone: no clutter, no upsell nag, no paying for it."],
              ["Start with real data", "Your workspace opens with a working example already inside, so you learn by editing, not by reading a manual."],
            ].map(([title, body], i) => (
              <li key={title} className="relative">
                <span className="text-sm font-mono text-brand">0{i + 1}</span>
                <h3 className="mt-2 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ─── Industries ───────────────────────────────────────────────────── */}
      <section id="industries" className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-xl">
          <p className="text-sm font-medium text-brand">It speaks your trade</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">The same software. Seven vocabularies.</h2>
          <p className="mt-4 text-fg-muted">
            A school has students, not leads. A clinic has patients. Business OS re-skins itself at signup —
            the screens, the words, the forms.
          </p>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Retail", "Customer"], ["Restaurant", "Guest"], ["Pharmacy", "Patient"], ["Wholesale", "Buyer"],
            ["Education", "Student"], ["Software house", "Client"], ["Real estate", "Prospect"],
          ].map(([industry, word]) => (
            <div key={industry} className="rounded-xl border border-line bg-surface/60 p-4 transition hover:border-brand/40">
              <p className="text-sm font-medium">{industry}</p>
              <p className="mt-1 text-xs text-fg-subtle">calls a lead a <span className="text-brand">{word}</span></p>
            </div>
          ))}
          <Link href="/signup" className="grid place-items-center rounded-xl border border-dashed border-line p-4 text-sm text-fg-muted transition hover:border-brand/40 hover:text-fg">
            Yours next →
          </Link>
        </div>
      </section>

      {/* ─── AI band ──────────────────────────────────────────────────────── */}
      <section className="atmosphere border-y border-line/60">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-brand">Not a chatbot. A consultant.</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Just ask. The AI runs the query.</h2>
            <p className="mt-4 max-w-lg text-fg-muted">
              Every screen has an AI prompt box. It scores your leads, forecasts demand, catches fraud, and
              answers plain-language questions about your own data — safely, tenant-isolated.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface/80 p-5 shadow-xl">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-brand">✦</span>
              <span className="text-fg-muted">how many customers are in Qualified this week?</span>
            </div>
            <div className="mt-4 border-t border-line pt-4 text-sm">
              <p className="text-fg">You have <span className="font-semibold text-fg">12 customers</span> in the Qualified stage, worth <span className="font-semibold text-brand">Rs 840,000</span>. 3 need follow-up today.</p>
              <p className="mt-3 font-mono text-[11px] text-fg-subtle">select count(*) from ai_v_leads where stage = &apos;Qualified&apos;…</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Comparison ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="text-center text-3xl font-semibold tracking-tight">Why not just buy three apps?</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface/50 p-6">
            <p className="mb-4 text-sm font-semibold text-fg-subtle">Separate tools</p>
            <ul className="space-y-2.5 text-sm text-fg-muted">
              {["Data doesn't connect", "Per-seat pricing that balloons", "Generic, English-first UI", "Three logins, three bills", "AI as a paid add-on"].map((t) => (
                <li key={t} className="flex gap-2"><span className="text-danger">✕</span>{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-brand/40 bg-brand-subtle/30 p-6">
            <p className="mb-4 text-sm font-semibold text-brand">Business OS</p>
            <ul className="space-y-2.5 text-sm text-fg">
              {["A won sale updates your stock", "Flat PKR price, unlimited value", "Speaks your industry's language", "One login, one bill, one AI", "AI-native, everywhere, included"].map((t) => (
                <li key={t} className="flex gap-2"><span className="text-success">✓</span>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-3xl font-semibold tracking-tight">Questions, answered</h2>
        <div className="mt-8 divide-y divide-line border-y border-line">
          {[
            ["Do I have to use all three modules?",
             "No. You pick at signup and change any time in Settings. A module that's off is gone from the nav, and its data stays untouched if you turn it back on."],
            ["Is my data separate from other businesses?",
             "Yes — enforced by the database itself, not just app code. Every row is tagged to your workspace and Postgres row-level security blocks cross-tenant reads even if a query tried."],
            ["What does it cost per user?",
             "Nothing. Pricing is a flat monthly rate in PKR per workspace, with seat limits by plan — not a per-seat charge that punishes you for growing."],
            ["Does it work on slow or patchy internet?",
             "The app is built for it, and POS is designed to keep billing during a drop and sync when the line returns."],
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

function Module({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="group rounded-2xl border border-line bg-surface/60 p-6 transition hover:border-brand/40 hover:bg-surface">
      <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-brand-subtle text-brand transition group-hover:scale-105">{icon}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-fg-muted">{desc}</p>
    </div>
  );
}

/* Stylized in-product preview (pure CSS — no screenshots) */
function AppPreview() {
  return (
    <div className="rounded-2xl border border-line bg-surface/90 p-3 shadow-2xl shadow-black/40">
      <div className="mb-3 flex items-center gap-1.5 px-1">
        <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["New", "Qualified", "Won"].map((col, c) => (
          <div key={col} className="rounded-lg border border-line bg-canvas/60 p-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-medium text-fg-muted">{col}</span>
              <span className="text-[10px] text-fg-subtle">{[3, 2, 1][c]}</span>
            </div>
            <div className="space-y-1.5">
              {Array.from({ length: [3, 2, 1][c] }).map((_, i) => (
                <div key={i} className="rounded-md border border-line bg-elevated p-1.5">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="h-1.5 w-10 rounded bg-fg-subtle/40" />
                    <span className={`rounded px-1 text-[8px] font-semibold ${c === 2 ? "bg-success/15 text-success" : c === 1 ? "bg-warning/15 text-warning" : "bg-elevated text-fg-subtle"}`}>{[42, 88, 71][c]}</span>
                  </div>
                  <div className="h-1 w-8 rounded bg-fg-subtle/25" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-brand/30 bg-brand-subtle/40 p-2">
        <span className="text-brand">✦</span>
        <div className="h-1.5 flex-1 rounded bg-brand/25" />
      </div>
    </div>
  );
}

function IconCrm() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="5" width="3" height="13" /></svg>;
}
function IconPos() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M7 20h10M12 16v4" /></svg>;
}
function IconHr() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3" /><path d="M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M16 3.1a4 4 0 0 1 0 7.8M21 21v-2a4 4 0 0 0-3-3.8" /></svg>;
}
