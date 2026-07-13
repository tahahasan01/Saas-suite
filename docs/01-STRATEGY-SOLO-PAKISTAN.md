# Strategy — Solo Founder, Pakistan-First, Self-Hosted

Context set by the founder: **building solo**, first market **Pakistan / South Asia**,
**self-hosting** auth and payments, and the goal is a **product to sell** (a real SaaS, not an
internal tool). This document adapts the master plan (`../PROJECT_PLAN.md`) to that reality.

---

## 1. The hard truth about "solo + all three apps"

The three PRDs (HRMS, CRM, POS) are each a fundable startup. One person cannot build all three to a
sellable standard in any reasonable time. Attempting it = 2 years of half-finished code and nothing
to sell. The only strategy that works solo is:

> **Build the platform core once. Ship ONE app to paying customers. Let revenue fund app #2 and #3.**

Because all three apps share ~40% of their code (the platform core), every app after the first is
dramatically cheaper. So the platform investment is not wasted even though you start narrow.

### Why CRM is the right first app for a solo founder
| Factor | CRM | POS | HRMS |
|---|---|---|---|
| Hardware dependency | **None** | Scanners, printers, cash drawer, scales | Biometric devices |
| Offline-sync engine | No | **Required (hard)** | Partial |
| Desktop/native agent | No | **Electron bridge** | **Monitoring agent** |
| Mobile app needed for MVP | No | No | **Yes (attendance)** |
| Payroll/tax engine | No | No | **Yes (deep)** |
| Sells to | Any business that chases leads | Shops only | Companies with HR |
| Shows off the platform USP | **Best** (localization + AI) | Good | Good |
| Solo build difficulty | **Lowest** | Highest | High |

CRM is pure web software. You can build, demo, and sell it from a laptop. **Recommendation: CRM is
app #1, POS is app #2 (hardware is a moat once you have revenue), HRMS is app #3.**

> If your near-term buyers are shopkeepers rather than sales teams, flip to POS first — but know it
> triples the solo difficulty. Decide based on who you can actually sell to this quarter.

---

## 2. Pakistan-specific stack decisions

| Concern | Global default | **Pakistan-first choice** |
|---|---|---|
| SaaS subscription billing | Stripe / Paddle | **Safepay** or **PayFast (Pakistan)** for cards; **bank transfer + manual activation** for early customers; keep an abstraction so you can add Stripe/Paddle for international later |
| Buyer's own payments (POS/CRM) | Stripe | **JazzCash, Easypaisa, bank transfer, cash**; card via Safepay |
| Primary comms channel | Email | **WhatsApp** (Meta Cloud API directly, or BSP like 360dialog / Twilio) |
| SMS | Twilio | Local aggregators (Jazz, Telenor) or Twilio fallback |
| Tax | VAT/GST | **FBR income tax slabs, provincial sales tax**; POS receipts may need FBR POS integration for registered retailers |
| Identity docs | Passport | **CNIC** (13-digit) parsing + verification |
| Couriers (POS/CRM fulfillment) | Shippo/EasyPost | **BlueEX, Leopards, TCS, PostEx, Trax** APIs |
| Currency | USD | **PKR** (store minor units as integers; multi-currency-ready) |
| Seasonal forecasting calendar | Christmas/Black Friday | **Eid-ul-Fitr, Eid-ul-Adha, Ramadan, Back-to-School, 14 Aug, wedding season** |
| Maps | Google Maps | Google Maps (works well in PK) for geofencing + TSP |

**Payments abstraction is mandatory:** define a `PaymentProvider` interface with `Safepay`,
`PayFast`, `ManualBankTransfer` implementations now; add `Stripe`/`Paddle` later without touching
app code. Same for `MessagingProvider` (WhatsApp/SMS) and `CourierProvider`.

---

## 3. Self-hosted auth & payments (lightweight)

You said self-host — honored, but pick tools a solo operator can actually run:

- **Auth:** **Ory Kratos** (self-hosted identity, handles login/registration/recovery/MFA, GDPR-
  friendly) *or* **Lucia / Auth.js on your own Postgres** if you want zero extra services. Avoid
  Keycloak solo (JVM ops overhead). Add SSO/SAML only when an enterprise deal demands it.
- **Payments:** self-host the *billing logic* (subscriptions, entitlements, invoices, dunning) in
  your own service; delegate only the card charge to Safepay/PayFast. You own the subscription
  state; the gateway just moves money. This is the right amount of "self-host."

---

## 4. Solo build principles (non-negotiable)

1. **Modular monolith, never microservices.** One deployable NestJS app with clean module
   boundaries. Microservices for a solo dev = distributed debugging with one debugger. You can
   extract a service later *if* load ever demands it.
2. **Lean on AI-assisted development.** You're already in Claude Code — use it to generate
   modules, tests, migrations, and boilerplate. This is what makes solo scope plausible.
3. **Buy/borrow every commodity.** Don't build a chart library, a rich-text editor, a job queue, a
   PDF generator, or an auth flow. Use shadcn/ui, BullMQ, Puppeteer/PDFKit, Ory/Lucia.
4. **Vertical slices, not horizontal layers.** Ship one industry (e.g., *Education/Institute* or
   *Retail*) fully working end-to-end before adding the next. A narrow product that fully works
   beats a broad product that half-works.
5. **Multi-tenant from line one.** Retrofitting tenancy is a rewrite. `tenant_id` + RLS from the
   first migration.
6. **Automate ops.** One-command deploy, automated backups, uptime + error alerts (Sentry + a
   status ping). You are also the SRE; make the machine do the babysitting.

---

## 5. Solo phased timeline (realistic, part-time-aware)

Assumes one experienced full-stack dev leaning hard on AI tooling. Adjust ×1.5–2 if part-time.

| Phase | Duration | Outcome |
|---|---|---|
| **P0 Foundation** | 3–4 wks | Monorepo, Postgres+RLS, Ory/Lucia auth, tenant signup, CI/CD, deploy to your VPS, industry-localized empty shell |
| **P1 Platform core** | 6–8 wks | Billing+entitlements (Safepay/manual), Terminology engine, Workflow/ECA v1, Notifications+WhatsApp, AI Gateway v1 (chat + safe NL→SQL + RAG), analytics scaffold, audit log |
| **P2 CRM MVP** | 8–10 wks | Pipelines (Kanban), leads + scoring + dedup, omnichannel timeline, agent portal + outcome logger, post-sale fulfillment (1–2 industries), lead ingestion (Meta/WhatsApp), reminders |
| **P2.5 Sell it** | ongoing | Onboard first 3–5 paying Pakistani businesses; iterate on real feedback |
| **P3 CRM depth + Field Force** | 2–3 mo | Route optimization, geofenced check-in (mobile), call center + Whisper summaries, accounts request bridge, ad scheduler |
| **P4 POS (app #2)** | 3–4 mo | Offline-first PWA, hardware bridge (Electron), billing hotkeys, ESC/POS + labels, AI restocking + seasonal forecast |
| **P5 HRMS (app #3)** | 4–6 mo | Attendance (mobile + face-match), payroll (FBR tax), recruitment, HR chatbot, LMS |

**First sellable product ≈ 4–5 months in** (platform + CRM MVP). Everything after is funded growth.

---

## 6. Monetization model

- **Per-tenant subscription**, priced by **active modules + seats** (entitlements engine enforces
  it). E.g., CRM base + WhatsApp add-on + AI-consultant add-on.
- **Tiers:** Starter (1 app, few seats, capped AI tokens) → Growth (multi-module, more AI) →
  Enterprise (SSO, schema isolation, higher limits).
- **AI as a metered add-on** so heavy AI users pay for their tokens (protects your margin).
- **Pakistan pricing reality:** price in PKR, keep entry tier low (SMB budgets), monetize add-ons
  and seats as they grow. Manual bank-transfer activation is fine for the first cohort.

---

## 7. What to say yes/no to (solo scope discipline)

**Yes now:** multi-tenancy, auth, entitlements, terminology engine, workflow engine, AI gateway,
notifications+WhatsApp, CRM core.

**Defer:** POS hardware, desktop monitoring agent, LMS video streaming, WebRTC A/V calling, AI
interview agent, schema-per-tenant, mobile apps (until Field Force needs them).

**Never build yourself:** charting, auth crypto, job queue, PDF engine, email deliverability, video
transcoding, an SFU. Integrate these.
