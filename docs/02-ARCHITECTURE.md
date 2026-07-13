# Platform Architecture

The full technical architecture of the Business OS platform + apps. Read `../PROJECT_PLAN.md` for
the executive view and `01-STRATEGY-SOLO-PAKISTAN.md` for the solo/Pakistan adaptations.

---

## 1. Architectural style

**Modular monolith** (one deployable) with strict internal module boundaries, event-driven inside,
ready to split into services only where load ever forces it.

```
apps/
  web/            Next.js — main tenant web app (all business apps render here)
  pos-shell/      Electron wrapper around a PWA (later, App #2)
  mobile/         Flutter — attendance + field force (later)
  desktop-agent/  Electron/C# monitoring agent (later, HRMS)
services/
  api/            NestJS modular monolith — the platform + apps
  ai/             Python FastAPI — ML: forecasting, embeddings, Whisper, vision
packages/
  ui/             Shared React components (shadcn/ui based)
  types/          Shared TS types + zod schemas (API contracts)
  sdk/            Typed client the frontends call
  config/         Lint/tsconfig/tailwind shared config
infra/
  docker/         Compose files, Dockerfiles
  migrations/     SQL migrations (Postgres)
```

### NestJS internal module map
```
platform/           apps/
  tenancy             hrms/          (later)
  billing             crm/           ← first
  auth-rbac           pos/           (later)
  entitlements
  terminology
  workflow            shared/
  notifications         audit
  comms                 files
  ai-gateway            search-vector
  analytics             events (bus)
  trust-safety          jobs (cron/queue)
```
Modules talk through an **internal event bus** (in-process emitter now, NATS later) and typed
service interfaces — never by reaching into each other's tables.

---

## 2. Data & tenancy

- **Postgres 16** as the system of record. Every business table has `tenant_id NOT NULL`.
- **Row-Level Security (RLS):** a session variable `app.tenant_id` is set from the authenticated
  request; RLS policies filter every row. Cross-tenant reads become impossible at the DB layer even
  if app code has a bug. This is the single most important safety net for a multi-tenant SaaS.
- **PGVector** extension for embeddings (RAG, CV↔JD matching, dedup) — avoids a separate vector DB
  early.
- **Redis** for: analytics aggregation cache, BullMQ job queue, rate limiting, Redis-Geo
  (field-force telemetry), and hot session data.
- **Object storage** (Cloudflare R2 / S3) for documents, receipts, screenshots, LMS video.
- **OLTP/OLAP split:** analytics and forecasting run against a **read replica** + **materialized
  views**, never the primary, so transactional latency (POS billing) is protected. Graduate to
  ClickHouse/Timescale only when volume demands.

### Migration & multi-tenant rules
1. Every table: `tenant_id`, `created_at`, `updated_at`, soft-delete where relevant.
2. Every query path sets `app.tenant_id`; no "god" queries bypass RLS except a small, audited
   admin/back-office role.
3. Money stored as integer minor units + currency code. Never floats.
4. Immutable business events (a completed sale, a payroll run) are append-only; corrections are new
   events, not updates.

---

## 3. Request lifecycle (how a call flows)

```
Client (web/mobile/POS)
   │  HTTPS + JWT (Ory/Lucia session)
   ▼
API Gateway (NestJS)  → rate limit → auth → resolve tenant → set app.tenant_id
   │
   ▼
Entitlements guard  → is this module enabled for this tenant/plan? (else 403)
   │
   ▼
RBAC guard  → does this user's role allow this action?
   │
   ▼
Feature module (crm/leads, hrms/attendance, …)
   │   ├─ reads/writes Postgres (RLS-scoped)
   │   ├─ emits domain events → event bus
   │   └─ calls platform services (ai-gateway, notifications, workflow)
   ▼
Response (typed via shared zod schema)

Async side: event bus → workflow engine (ECA), notifications, analytics rollups,
            AI jobs (summarize/score/forecast) run in BullMQ workers.
```

Two guards — **entitlements** (did you pay for this module?) and **RBAC** (are you allowed this
action?) — sit in front of every feature endpoint. That combination is what makes "modular,
pay-per-module" real and secure.

---

## 4. The Terminology Engine (the USP, technically)

The product's differentiator is that the UI re-labels itself per industry. Implementation:

- Nothing user-facing is a hardcoded string. Labels are **keys** resolved at render time.
- `terminology(industry_type, key, locale, label)` table seeds mappings:

| industry_type | key | label (en) |
|---|---|---|
| education | lead | Student |
| education | product | Course / Program |
| education | fulfillment_date | Batch Start & Class Timing |
| retail | lead | Customer |
| retail | product | Item / SKU / Variant |
| retail | fulfillment_date | Courier Dispatch |
| b2b_software | lead | Corporate Client |
| real_estate | lead | Investor / Buyer |

- Frontend loads the tenant's industry map once, caches it, and a `<T k="lead"/>` component renders
  the right word everywhere. Same underlying `leads` table; only presentation changes.
- **Also drives behavior, not just words:** industry metadata switches which post-sale fulfillment
  form renders (SKU/courier for retail vs batch/instructor for education), which POS layout loads,
  etc. So terminology + a small rules layer = "the system becomes your industry's software."

---

## 5. Workflow / ECA Engine

Event–Condition–Action automation, tenant-configurable, no arbitrary code execution.

- **Event:** domain events off the bus (`lead.created`, `leave.approved`, `stock.below_threshold`,
  `invoice.paid`).
- **Condition:** sandboxed expression evaluation over the event payload + a whitelisted context
  (`lead.score > 80 AND lead.city == 'Karachi'`). Use a safe expression lib (e.g., JEXL/CEL-style),
  never `eval`.
- **Action:** a fixed catalog of safe actions (send notification, assign owner, create task,
  dispatch WhatsApp, update field, call webhook, generate document).
- Stored as `workflows(trigger, conditions_jsonb, actions_jsonb, enabled)`; executed by a worker so
  slow actions never block the request.

This one engine powers HRMS ("If Leave_Approved → notify + update attendance"), CRM (lead routing,
billing alerts), and POS (restock triggers). Build it once.

---

## 6. Notifications & Omnichannel Comms

- **Notifications service:** one API, many channels (web push, mobile push, email, SMS, WhatsApp),
  templated, user-preference-aware, supports scheduled/cron delivery (the "15 min before follow-up"
  reminders). Providers behind a `MessagingProvider` interface (WhatsApp-first for Pakistan).
- **Omnichannel timeline:** a normalized `comms_timeline` table that ingests email (IMAP/SMTP),
  WhatsApp webhooks, SMS, LinkedIn, and call logs (Twilio/Exotel) into **one chronological feed per
  contact/employee**. Every inbound webhook is signature-verified + idempotency-keyed so retries
  don't duplicate.

---

## 7. AI Gateway (see `03-HOW-THE-APPS-WORK.md` §AI for behavior)

A single internal service every module calls. Responsibilities:
- **Chat / assistant** (RAG over the tenant's knowledge base + live data).
- **NL→SQL** over **read-only, tenant-scoped curated views** with an allow-list and validation —
  never raw tables (this is the critical safety design).
- **Summarization** (call transcripts via Whisper → actionable summary).
- **Scoring** (lead priority, resign risk).
- **Forecasting** (delegates to the Python service: Prophet/ARIMA).
- **Vision/OCR** (CNIC, passport, receipts, CV parsing).
- **Governance:** per-tenant token budgets, model routing (cheap model for classification, strong
  model for reasoning), response caching, prompt-injection defenses, full audit in `ai_interactions`.

Primary model: **Claude** (Opus/Sonnet by task complexity, Haiku for cheap classification).

---

## 8. Trust & Safety

Shared anti-fraud used by HRMS attendance, POS cashiers, and field-force check-ins:
- Device attestation (root/jailbreak detection), VPN/proxy detection, **mock-GPS detection**.
- Behavioral anomaly flags: excessive bill cancellations/refunds (POS), attendance proxy attempts
  (face-match mismatch), impossible travel between check-ins.
- Outputs risk signals to management dashboards + workflow triggers.

---

## 9. Security & compliance baseline

- **PII encryption:** column-level encryption for CNIC, passport, biometric templates, payroll,
  bank details; separate access audit. Biometric face templates treated as the most sensitive class.
- **Consent gates** for employee monitoring (screenshots/keystrokes) — opt-in, regionally
  configurable, retention-limited, transparent to the monitored employee.
- **Webhook security:** HMAC signature verification + replay/idempotency on every integration.
- **AI safety:** NL→SQL confined to curated views + allow-list + tenant filter + query validation.
- **Secrets** in a vault (not env files in the repo); rotate keys.
- **Backups:** automated nightly Postgres backups + periodic *restore drills* (an untested backup
  is not a backup).

---

## 10. Observability & delivery

- **Observability:** OpenTelemetry traces + structured logs + metrics; Sentry for errors; alerting
  on error rate, latency, queue depth. Mandatory to defend the POS "sub-100ms" claim.
- **Environments:** dev → staging → prod, each isolated.
- **CI/CD:** GitHub Actions — lint, typecheck, test, build, migrate, deploy. Deploy is one command.
- **Perf budgets in CI** for the latency-critical POS paths.

---

## 11. Scaling path (only when needed)

1. Start: single VPS, Docker Compose, Postgres + Redis + API + AI service.
2. Grow: managed Postgres + read replica, Redis cluster, horizontal API replicas behind a load
   balancer, object storage + CDN.
3. Scale: extract the hottest modules (AI, analytics, comms) into separate services on the event
   bus (NATS/Kafka); Kubernetes; ClickHouse for analytics.

Do not pre-build step 3. The modular monolith is designed so that extraction is mechanical when the
day comes.
