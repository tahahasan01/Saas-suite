# Business OS — Master Project Plan

> Consolidated technical plan for the **Next-Gen AI-Powered Business System**, derived from the
> Project Vision Document and the three Tech-Handover PRDs (HRMS, CRM/Field-Force, POS/Inventory).
> This document reframes the three PRDs as **one modular platform** and lays out architecture,
> stack, data model, phasing, effort, and the gaps the source docs left open.

---

## 1. The One-Line Truth

You are not building three products. You are building **one multi-tenant "Business Operating System"
platform** with a shared core, on top of which three business apps (HRMS, CRM, POS) are activated
per tenant like plug-ins. Everything the three PRDs repeat — tenancy, billing, auth, AI, workflow
rules, industry localization, anti-fraud, notifications, analytics — is **platform**, built once.

```
                         ┌───────────────────────────────────────────┐
    TENANT (a company) ─▶│  Activates only the modules it pays for    │
                         └───────────────────────────────────────────┘
   ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────┐
   │  APP: HRMS   │   │  APP: CRM /  │   │  APP: POS & Inventory     │  ← pluggable apps
   │  (32 mods)   │   │  Field Force │   │  (offline-first)          │
   └──────┬───────┘   └──────┬───────┘   └──────────┬───────────────┘
          └──────────────────┴──────────────────────┘
   ┌───────────────────────── PLATFORM CORE ─────────────────────────┐
   │ Tenancy·Billing │ Auth·RBAC │ Terminology(i18n) │ Workflow/ECA   │
   │ AI Gateway (chat·NL→SQL·RAG·summarize·forecast·score·vision)     │
   │ Notifications │ Omnichannel Comms │ Trust & Safety │ Analytics   │
   │ Audit·E-Sign │ Files(S3) │ Search·Vector │ Event Bus │ Jobs      │
   └──────────────────────────────────────────────────────────────────┘
   ┌──────────────── INFRA: Postgres · Redis · Object store · CDN ────┐
```

---

## 2. Scope Reality Check (read this first)

Each of the three PRDs is, individually, a venture-scale product:

- **HRMS** lists 32 modules (attendance with face-verify + geofencing, payroll+tax, desktop
  monitoring agent, AI recruiter, LMS, e-sign, WebRTC calling, HR RAG chatbot…).
- **CRM/Field-Force** lists ~25 modules (multi-pipeline Kanban, omnichannel timeline, ad-platform
  lead ingestion, TSP route optimization, call-center + Whisper, accounts request bridge…).
- **POS** demands sub-100ms billing, offline-first sync, native hardware bridges (scanners,
  ESC/POS printers, cash drawers, scales), ZPL/TSPL label printing, and time-series demand
  forecasting.

**Honest estimate for the *full* scope as written:** ~18–30 months with a team of 6–10 engineers
(2 backend, 2 frontend, 1 mobile, 1 AI/ML, 1 DevOps/SRE, 1 QA, plus lead/PM). It is **not** a
solo or 3-month build. The plan below is therefore **MVP-first and platform-first** so you ship
something real in ~12–16 weeks and grow it, instead of stalling on a 2-year monolith.

---

## 3. Gaps & Improvements the Source Docs Missed

The PRDs are strong on *features* and light on the *un-sexy foundations that decide whether this
survives contact with real customers*. These are the additions I'm baking into the plan:

### Security, privacy & compliance (biggest risk)
- **PII vault + encryption.** CNIC, passport, biometric face templates, payroll, and CVs are
  highly sensitive. Encrypt at rest (column-level for PII), tokenize identifiers, and keep a
  separate access log. Face templates especially are biometric data — legally radioactive in many
  jurisdictions.
- **NL→SQL is a security hole if done naively.** Letting an LLM write SQL against your DB invites
  prompt-injection → data exfiltration across tenants. Mitigation: the AI only queries a
  **read-only, tenant-scoped, curated view layer** through a **query allow-list / parameterized
  intent API**, never raw table access, and every generated query is validated + tenant-filtered
  before execution.
- **Employee monitoring (screenshots/keystrokes) is a legal minefield.** Requires explicit
  consent, regional legality checks (illegal or restricted in parts of the EU/US), retention
  limits, and admin-visible transparency. Treat as an opt-in module with a consent gate, not a
  default.
- **Webhook security & idempotency.** Every inbound integration (Meta/Google/LinkedIn ads,
  WhatsApp, Twilio, Shopify/Woo) needs signature verification, replay protection, and idempotency
  keys so retries don't double-create leads/orders.

### Architecture foundations not mentioned
- **Event bus / async backbone.** The docs say "microservices" but name no messaging layer.
  Start with **BullMQ (Redis)** for jobs; introduce **NATS or Kafka** only when you truly split
  services. Everything reactive (lead routing, notifications, sync, forecasting) rides this.
- **Multi-tenancy model must be chosen deliberately** (see §5). The docs assume "isolation" but
  don't specify how. Recommendation: Postgres **Row-Level Security (RLS)** shared-schema, with
  schema-per-tenant available for enterprise.
- **Entitlements / feature-flags engine.** "Activate only modules you pay for" = a real
  entitlements service tying Stripe/Paddle subscriptions → module access → UI gating → API
  authorization. This is core, not an afterthought.
- **OLTP vs OLAP split.** Heavy analytics/forecasting against the transactional DB will kill
  billing latency. Push analytics to read-replicas or a warehouse (start: read-replica +
  materialized views; later: ClickHouse/BigQuery).
- **Offline conflict resolution (POS).** "Delta sync" is not enough — you need an explicit
  conflict policy (per-entity last-write-wins with server clock, plus append-only for immutable
  events like completed sales). Design the sync protocol before writing the POS.

### Operational must-haves
- **Observability** (structured logs, distributed tracing, metrics, alerting) — mandatory given
  "sub-100ms" and "zero-latency" targets. You can't hit latency SLAs you can't measure.
- **CI/CD + IaC + environments** (dev/staging/prod), automated tests, blue-green or canary deploys.
- **AI cost governance.** Token budgets per tenant, model routing (cheap model for classification,
  strong model for reasoning), caching, and a kill-switch. Otherwise AI cost scales with abuse.
- **Rate limiting & abuse protection** at the gateway.
- **Backups + disaster recovery + tested restores.**
- **WebRTC at scale needs an SFU** (LiveKit/mediasoup), not pure P2P, once calls exceed 1:1.

---

## 4. Recommended Tech Stack

Chosen for a small, fast team on a cost-sensitive budget (you already run Cloudflare + Hostinger),
with a clean path to scale. Bias: **one language across the stack (TypeScript)** + a thin Python
service only where ML libraries demand it.

| Layer | Choice | Why |
|---|---|---|
| **Monorepo** | Turborepo (or Nx) | Share types/UI/config across apps + platform |
| **Backend** | **NestJS (TypeScript)** — modular monolith first | Structured, DI, testable; split to services later without rewrite |
| **AI/ML service** | **Python + FastAPI** | Prophet/ARIMA forecasting, embeddings, Whisper live here |
| **Primary LLM** | **Claude (Anthropic)** — Opus/Sonnet by task | Best reasoning for the "active consultant"; route cheap tasks to Haiku/Sonnet |
| **DB** | **PostgreSQL 16 + PGVector** | One DB for relational + vector (skip Pinecone early); RLS for tenancy |
| **Cache / jobs / geo** | **Redis** (+ BullMQ) | Aggregation cache, job queue, Redis Geo for field-force telemetry |
| **Time-series (later)** | TimescaleDB / ClickHouse | POS forecasting + heavy analytics off the OLTP path |
| **Web frontend** | **Next.js + React, TanStack Query, Tailwind, shadcn/ui** | Fast, typed, component-driven |
| **POS frontend** | **PWA (offline) + Electron shell** | IndexedDB (Dexie) offline; Electron/Node-HID for hardware bridge |
| **Mobile** | **Flutter** (or React Native/Expo) | Attendance selfie/GPS + field-force app need native sensors |
| **Desktop monitor agent** | Electron or C# .NET | Screenshot/idle capture (consent-gated) |
| **Realtime** | Socket.io (chat/notifications) + **LiveKit** (A/V) | P2P doesn't scale; SFU for calls |
| **Auth** | Keycloak *or* Auth.js + Postgres, RBAC + SSO/SAML for enterprise | Don't hand-roll crypto |
| **Payments** | **Paddle** (Merchant-of-Record, handles global tax) or Stripe | Paddle simplifies international VAT/tax |
| **Object storage** | Cloudflare R2 / S3 | Receipts, screenshots, documents, video (LMS) |
| **Maps** | Google Maps Platform (Matrix/Distance for TSP + geofencing) | Mapbox as alt |
| **Infra** | Docker → single VPS/compose (MVP) → Kubernetes (scale) | You have Hostinger VPS + Cloudflare already |
| **Observability** | OpenTelemetry + Grafana/Loki/Tempo (or Sentry + Better Stack) | Traces/logs/metrics from day one |
| **CI/CD** | GitHub Actions | Lint, test, build, deploy per environment |

---

## 5. Multi-Tenancy Decision

**Recommendation: shared database, shared schema, Postgres Row-Level Security (RLS), keyed on
`tenant_id`.** Every table carries `tenant_id`; RLS policies make cross-tenant reads structurally
impossible even if application code has a bug. Offer **schema-per-tenant** as an enterprise upgrade
for customers who demand physical isolation.

| Model | Isolation | Cost | Ops complexity | Verdict |
|---|---|---|---|---|
| Shared schema + RLS | Logical (enforced by DB) | Lowest | Low | **Default — start here** |
| Schema-per-tenant | Strong | Medium | Medium | Enterprise tier |
| DB-per-tenant | Physical | High | High | Only for regulated whales |

RLS + a mandatory `tenant_id` on every query, set from the authenticated session, is the safest
default that a small team can actually operate.

---

## 6. Platform Core — Build-Once Services

These are the foundation. **Nothing app-specific ships until these exist** (at least in v1 form).

1. **Tenancy & Billing** — orgs, subscriptions, plans, **entitlements** (which modules are on),
   Stripe/Paddle sync, seat counting, trials, dunning.
2. **Identity, Auth & RBAC** — users, roles, granular permissions per module, SSO/SAML, session +
   device management, audit trail.
3. **Terminology / Localization Engine** — the USP. UI labels are **data-attribute bound, not
   hardcoded**. `industry_terminology` table maps `{industry → {lead_label, product_label,
   fulfillment_label, …}}`; frontend resolves labels at runtime from tenant industry metadata.
   Also handles language localization.
4. **Workflow / ECA Rule Engine** — Event → Condition → Action. Visual builder + a safe execution
   engine (no arbitrary code; sandboxed expression evaluation). Powers "If Leave_Approved → notify
   + update attendance", lead routing, billing alerts, restock triggers.
5. **AI Gateway** — one service all apps call for: conversational assistant, **NL→SQL over curated
   read-only views**, RAG over the company knowledge base, call/interaction summarization (Whisper),
   forecasting, lead/resign scoring, and vision/OCR. Handles model routing, token budgets, caching,
   guardrails, and prompt-injection defense.
6. **Notifications** — unified push (web/mobile), email, SMS, WhatsApp; templates; user prefs;
   scheduled/cron delivery.
7. **Omnichannel Comms** — normalizes email (IMAP/SMTP), WhatsApp Business API, SMS, LinkedIn, and
   call logs (Twilio/Exotel) into **one chronological timeline per contact/employee**.
8. **Trust & Safety** — device attestation (root/jailbreak), VPN/proxy detection, mock-GPS
   detection, behavioral anomaly flags (bill cancellations, attendance proxying). Shared by HRMS +
   POS + Field-Force.
9. **Analytics** — Redis-cached aggregation layer + materialized views feeding dashboards
   (Chart.js/D3), read off replicas.
10. **Cross-cutting**: Audit log, E-signature service, File/object storage, Search + Vector store,
    Event bus, Job scheduler/cron.

---

## 7. The Three Apps (on top of the core)

### App A — HRMS
Employee ledger & identity, document OCR (CNIC/passport/CV), advanced attendance
(onsite QR-rolling-token + biometric webhook, outdoor geofencing + route history, **AI selfie
face-match** anti-proxy), productivity monitoring (desktop agent, shift/roster engine), AI
recruitment (vector CV↔JD matching, AI interviewer), payroll engine (configurable
deductions/bonuses/OT/tax) + expense claims, HR RAG chatbot + manager NL→SQL, internal comms
(chat/file/WebRTC), LMS, asset tracker, visitor gateway, resign-risk prediction.

### App B — CRM / Revenue Intelligence & Field Force
Multi-pipeline drag-drop Kanban, omnichannel timeline, marketing hub (Meta/Google/LinkedIn ad
lead ingestion + auto-routing round-robin/WhatsApp dispatch + post scheduler), AI lead scoring +
fuzzy-match dedup, agent portal + interaction outcome logger + post-sale fulfillment (industry-
conditional forms), **cross-departmental accounts request bridge** (sales can't touch ledgers →
request quotation/invoice → accounts approves → auto-PDF), field force (TSP route optimization +
geofenced check-in selfie), call center (click-to-call + Whisper summarization), workflow builder,
e-commerce ingestion (Shopify/Woo/REST).

### App C — POS & Predictive Inventory
Offline-first IndexedDB + background delta sync, hardware bridge (HID scanners, ESC/POS printers,
cash drawers, RS232 scales), high-speed keyboard-driven billing (F1–F8 hotkey map), ESC/POS
receipt assembler + ZPL/TSPL label engine, industry UX contexts (retail/restaurant-KOT/
pharmacy-expiry-FIFO/wholesale-tiered-pricing), AI restocking consultant (velocity → alerts),
**60-day seasonal forecasting** (Prophet/ARIMA → draft purchase order), predictive cache tables.

---

## 8. Phased Roadmap

### Phase 0 — Foundations (Weeks 1–4)
Monorepo, environments, CI/CD, Docker, Postgres+RLS, Redis, auth skeleton, observability, base UI
kit, design system, tenant + user + RBAC data model. **Exit:** a tenant can sign up, log in, and
see an empty shell that re-labels itself by chosen industry.

### Phase 1 — Platform Core v1 (Weeks 5–12)
Tenancy+billing+entitlements, Terminology engine, Workflow/ECA v1, Notifications, AI Gateway v1
(chat + RAG + safe NL→SQL over views), Analytics scaffold, Audit. **Exit:** the modular,
industry-localized, AI-enabled shell is real and billable — with zero business modules yet.

### Phase 2 — First Flagship App MVP (Weeks 13–24)
Pick **one** app to ship first (decision below). Build its 3–5 highest-value modules end-to-end on
the platform. **Exit:** a paying customer can run a real workflow daily.

### Phase 3 — Deepen Flagship + start App #2 (Months 7–12)
Complete flagship's remaining modules; begin the second app reusing the entire core (this is where
the platform investment pays back — App #2 is ~40% cheaper).

### Phase 4 — Third app, mobile, scale (Months 12–24)
Third app, mobile apps (attendance/field-force), desktop agents, hardware certification matrix,
enterprise features (SSO, schema-per-tenant), analytics warehouse, service extraction where load
demands.

### Recommended flagship (Phase 2) — my pick, pending your call
- **POS first** if your market is retail/pharmacy/restaurant and you want the fastest visible
  "wow" (offline billing + hardware + AI restocking demos brilliantly, self-contained).
- **CRM first** if you want the industry-localization USP front-and-center and a broad B2B TAM.
- **HRMS first** if you already have HR leads waiting — but it's the heaviest first build
  (payroll + monitoring + attendance are all deep).

My default recommendation: **CRM first** (best showcases the platform's localization + AI USP,
broad market, no hardware dependency), or **POS first** if your near-term buyers are shopkeepers.

---

## 9. High-Level Data Model (core tables)

```
tenants(id, name, industry_type, plan_id, status, settings_jsonb)
users(id, tenant_id, email, role_id, status, mfa, ...)
roles(id, tenant_id, name) · permissions(role_id, module, action)
subscriptions(id, tenant_id, provider, plan, status, current_period_end)
entitlements(tenant_id, module_key, enabled, limits_jsonb)
industry_terminology(industry_type, key, label, locale)
workflows(id, tenant_id, trigger, conditions_jsonb, actions_jsonb, enabled)
notifications(id, tenant_id, user_id, channel, template, payload, status, scheduled_at)
comms_timeline(id, tenant_id, subject_type, subject_id, channel, direction, body, ts)
audit_log(id, tenant_id, actor, action, entity, before, after, ts)
ai_interactions(id, tenant_id, user_id, kind, prompt, response, tokens, cost, ts)
files(id, tenant_id, owner, kind, url, encrypted, meta)
vector_chunks(id, tenant_id, source, embedding vector, content)   -- PGVector
-- App-specific tables namespaced per app (hrms_*, crm_*, pos_*)
-- POS mirror tables also exist client-side in IndexedDB for offline
Occasion_Calendar_Matrix(...) · AI_Predictive_Cache_Store(...)     -- from POS PRD
```
Every table carries `tenant_id`; RLS enforces isolation.

---

## 10. Top Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Scope (3 ventures at once) | Stall / burnout | Platform-first, one flagship MVP, strict phase gates |
| NL→SQL prompt injection / cross-tenant leak | Data breach | Read-only curated views, allow-list, tenant filter, validation |
| Biometric/PII/monitoring legality | Legal liability | Consent gates, encryption, retention limits, regional config |
| Offline sync conflicts (POS) | Lost/duplicate sales | Explicit conflict policy + append-only sale events + idempotency |
| Hardware fragmentation (POS) | Endless support | Certified device matrix; abstract behind the bridge; limit v1 SKUs |
| Payroll tax across jurisdictions | Wrong pay = churn | Versioned, data-driven tax-rule tables; start with 1 country |
| AI cost blowup | Margin loss | Token budgets, model routing, caching, kill-switch |
| "Sub-100ms POS" SLA | Broken promise | Offline-first local execution + observability + perf budget in CI |

---

## 11. Immediate Next Steps

1. **Confirm the two decisions in §12** (flagship app + team/timeline shape) so Phase 0/1 can start.
2. Stand up the monorepo + Phase 0 skeleton (tenancy, auth, RLS, CI/CD, localization shell).
3. Write the **API contract + data model** for the platform core before any app code.
4. Draft the **AI safety spec** (NL→SQL guardrails, tenant scoping, PII handling) — gate for AI work.

---

## 12. Decisions I Need From You

- **Flagship app for Phase 2** — POS, CRM, or HRMS first?
- **Team & timeline** — solo, small team, or funded team? (Sets how aggressively we phase.)
- **First target market/geography** — decides tax rules, WhatsApp/SMS providers, and industry
  presets to build first.
- **Buy-vs-build on auth/payments** — use Clerk/Keycloak + Paddle (faster) or self-host more?
```
