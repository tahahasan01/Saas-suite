import Link from "next/link";
import { Wordmark } from "@/components/ui";

const tiers = [
  {
    name: "Starter",
    price: "Rs 2,500",
    tagline: "For a small shop or team getting started.",
    features: ["1 app (CRM, POS, or Staff)", "Up to 5 users", "Industry-localized UI", "Basic automations", "100 AI queries / month"],
    cta: "Start free trial",
    highlight: false,
  },
  {
    name: "Growth",
    price: "Rs 6,000",
    tagline: "Run your whole business in one place.",
    features: ["All 3 apps (CRM + POS + Staff)", "Up to 20 users", "Unlimited automations", "WhatsApp channel", "Predictive inventory + lead scoring", "1,000 AI queries / month"],
    cta: "Start free trial",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    tagline: "For larger teams with advanced needs.",
    features: ["Unlimited users", "SSO & data isolation", "Dedicated support", "Custom AI limits", "Onboarding & training"],
    cta: "Contact sales",
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10 flex items-center justify-between">
        <Wordmark />
        <Link href="/login" className="text-sm text-fg-muted hover:text-fg">Sign in</Link>
      </header>

      <div className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">One flat price. Your whole business.</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-fg-muted">
          CRM, POS, and Staff management in a single AI-powered app — localized to your industry.
          Flat monthly pricing, <span className="text-fg">not per-seat</span>. Priced in PKR.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {tiers.map((t) => (
          <div key={t.name}
               className={`flex flex-col rounded-2xl border p-6 ${t.highlight ? "border-brand bg-brand-subtle/30" : "border-line bg-surface"}`}>
            {t.highlight && <span className="mb-3 w-fit rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold text-brand-fg">Most popular</span>}
            <h2 className="text-lg font-semibold">{t.name}</h2>
            <p className="mt-1 text-sm text-fg-muted">{t.tagline}</p>
            <p className="mt-4 text-3xl font-semibold">
              {t.price}
              {t.price !== "Custom" && <span className="text-sm font-normal text-fg-subtle"> / month</span>}
            </p>
            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {t.features.map((f) => (
                <li key={f} className="flex gap-2 text-fg-muted">
                  <span className="text-brand">✓</span>{f}
                </li>
              ))}
            </ul>
            <Link href="/signup"
                  className={`mt-6 rounded-lg px-4 py-2 text-center text-sm font-medium ${t.highlight ? "bg-brand text-brand-fg hover:bg-brand-hover" : "border border-line hover:border-line-strong"}`}>
              {t.cta}
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-fg-subtle">
        All plans include a 14-day free trial. No card required. Cancel anytime.
      </p>
    </main>
  );
}
