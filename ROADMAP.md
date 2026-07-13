# Business OS — Build Roadmap & Progress

Living checklist for the unified all-in-one Business OS (HRMS + CRM + POS).
Updated as each step lands. See `PROJECT_PLAN.md` and `docs/` for the design rationale.

**Legend:** `[x]` done · `[~]` in progress · `[ ]` not started
**Repo:** https://github.com/tahahasan01/Saas-suite

---

## Status at a glance

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 0 | Foundation (tenancy, auth, RLS, terminology) | ✅ Done |
| Phase 1a | Platform core: RBAC, team, sections, audit, shell | ✅ Done |
| AI Gateway v1 | Safe NL→SQL assistant | 🟡 Built — awaiting live key test |
| Phase 2 | CRM core (pipelines, leads, Kanban) | ✅ Done |
| Design system | Tokens, component library, cohesive dark UI | ✅ Done |
| Phase 1b | Workflow engine + WhatsApp notifications + billing | ⬜ Next |
| Phase 2b | CRM depth (fulfillment, invoicing, ingestion, scoring) | ⬜ Planned |
| Phase 3 | POS & Predictive Inventory | ⬜ Planned |
| Phase 4 | HRMS | ⬜ Planned |
| Ops | Observability, backups, staging | ⬜ Planned |

**Current position:** AI Gateway built; needs `ANTHROPIC_API_KEY` for the live LLM round-trip.

---

## Phase 0 — Foundation Shell ✅  (commit `9718522`)

- [x] Monorepo (npm workspaces + Turborepo), TypeScript config
- [x] Docker Compose: Postgres 16 + pgvector, Redis (Postgres on :5433)
- [x] Raw-SQL migration runner + `schema_migrations` ledger
- [x] Multi-tenancy: `tenant_id` on every table + **Row-Level Security**
- [x] Two-role DB model (owner for auth/signup, `app_user` for RLS-enforced queries)
- [x] Auth: argon2 sessions — signup, login, logout, `/me`
- [x] Tenant + Owner role + entitlements bootstrapped on signup
- [x] Terminology engine — 7 industries, 49 labels, per-industry re-skin
- [x] Next.js shell: login, signup with **live terminology preview**, dashboard
- [x] CI (GitHub Actions: web typecheck/build + API migrate against Postgres)
- [x] GitHub repo created + pushed
- [x] **Verified:** two tenants, RLS blocks cross-tenant reads, per-industry labels

## Phase 1a — Platform Core (part 1) ✅  (commit `4b65b70`)

- [x] Audit log table (migration 0002) with RLS
- [x] RBAC: `require(section, action)` guard (Owner = admin on all)
- [x] Team API: list/create users, list/create roles
- [x] Entitlements: toggle a section on/off
- [x] Shared authenticated app shell (route group + sidebar, tailored per tenant)
- [x] Settings → Team (list/add members) and Sections (live toggle)
- [x] **Verified:** Viewer role gets 403 on all admin actions; audit trail records mutations

## AI Gateway v1 🟡  (commit `5751b9c`)

- [x] `ai_interactions` log + curated read-only views (migration 0004)
- [x] Views use `security_invoker` → RLS enforced (tenant B sees 0 of A's rows)
- [x] SQL guard: single read-only SELECT, allowlisted views, keyword/comment/multi-stmt blocking
- [x] Read-only transaction + statement timeout for AI SQL execution
- [x] `/ai/ask` endpoint (crm:read guarded) + token logging
- [x] Dashboard AI prompt box wired
- [x] **Verified:** 12/12 SQL-injection attack cases blocked; views tenant-isolated
- [ ] Live LLM round-trip test (needs `ANTHROPIC_API_KEY`)
- [ ] Model routing (Haiku for classification, Sonnet for reasoning) + token budgets
- [ ] RAG assistant over company knowledge base
- [ ] Proactive alerts (cold lead, follow-up due)

## Phase 2 — CRM Core ✅  (commit `5907a03`)

- [x] CRM schema (migration 0003): pipelines, stages, leads, interactions + RLS + pg_trgm
- [x] Lazy default-pipeline provisioning (New→Contacted→Qualified→Proposal→Won→Lost)
- [x] Leads CRUD + stage move
- [x] Fuzzy duplicate detection (phone/email exact + company trigram) with force override
- [x] Interaction / outcome logger with follow-up scheduling
- [x] Kanban board with drag-and-drop (optimistic) + per-stage value totals
- [x] Lead drawer: details + outcome logger + interaction timeline
- [x] Fully industry-localized (retail sees "Customers", education sees "Students")
- [x] Section entitlement enforced (disabled CRM → 403)
- [x] **Verified in-browser:** login → localized Kanban with live data, dedup 409, stage move

---

## Frontend Design System ✅

- [x] Design tokens (Tailwind v4 `@theme`): canvas/surface/elevated/line, fg scale, brand, semantic
- [x] Inter font, refined base styles, focus rings, slim scrollbars
- [x] Component library: Button (variants/sizes), Input/Textarea/Select, Card, Badge, Wordmark
- [x] Rebranded shell (sidebar + wordmark + tenant card), auth screens, dashboard, CRM, settings
- [x] **Verified in-browser:** cohesive dark SaaS aesthetic across all pages

---

## Phase 1b — Platform Core (part 2) 🟡  In progress

- [x] Notifications service (in-app) — `notifications` table (RLS), feed API, mark-all-read
- [x] Notification bell UI (unread badge, dropdown, polling) in the app header
- [x] **Workflow / ECA engine** — declarative conditions/actions (no eval), triggers
  `lead.created` / `lead.stage_changed` / `interaction.logged`; verified conditional firing
- [x] Default "deal won → notify owner" seeded as a system workflow
- [x] Automations builder UI (list/toggle/delete + create rule with optional condition)
- [ ] WhatsApp Cloud API integration (needs `WHATSAPP_TOKEN` — Pakistan-first channel)
- [ ] Follow-up reminders (15-min-before, via scheduler)
- [ ] More action types (assign owner / round-robin, send WhatsApp, create task)
- [ ] Billing: self-hosted subscriptions + Safepay/manual provider + entitlement sync
- [ ] Analytics: Redis aggregation + materialized views for dashboards
- [ ] Background jobs (Celery/RQ or APScheduler) + cron

## Phase 2b — CRM Depth 🟡  In progress

- [x] Lead scoring (1–100) on create — heuristic; AI-refine path documented
- [x] Post-sale fulfillment forms (industry-conditional: SKU/courier vs batch/instructor)
- [x] Cross-department: invoice request → accounts approve → auto-PDF (separation of duties)
- [ ] Lead ingestion webhooks (WhatsApp, Meta/Google/LinkedIn lead ads)
- [ ] Omnichannel timeline (email IMAP/SMTP + WhatsApp + SMS merged per contact)
- [ ] E-commerce ingestion (Shopify/WooCommerce)
- [ ] Field Force (mobile): TSP route optimization + geofenced check-in + selfie
- [ ] Call center: click-to-call + Whisper transcription → AI summary

## Phase 3 — POS & Predictive Inventory ⬜  Planned

- [ ] Products/inventory schema + stock movements
- [ ] Offline-first PWA (IndexedDB) + delta sync + conflict policy
- [ ] Electron hardware bridge (scanners, ESC/POS printers, cash drawer, scales)
- [ ] Keyboard-driven billing (F1–F8 hotkeys)
- [ ] ESC/POS receipt assembler + ZPL/TSPL label engine
- [ ] Industry UX (retail scan-grid, restaurant KOT, pharmacy FIFO/expiry, wholesale tiers)
- [ ] AI restocking consultant (velocity → alerts)
- [ ] 60-day seasonal forecast (Prophet/ARIMA) → one-click draft purchase order

## Phase 4 — HRMS ⬜  Planned

- [ ] Employee ledger + OCR onboarding (CNIC/passport/CV)
- [ ] Attendance: rolling-QR + AI selfie face-match + geofencing (anti-proxy)
- [ ] Shift/roster engine (rest-rules)
- [ ] Payroll engine (deductions/bonuses/OT + FBR tax) + expense claims
- [ ] HR RAG chatbot + manager NL→SQL
- [ ] AI recruitment (CV↔JD vector matching, interview questions)
- [ ] Resign-risk prediction
- [ ] LMS, asset tracker, visitor gateway

## Cross-cutting / Ops 🟡  In progress

Hardening applied from the bundled `security-review` + `database-reviewer` skills:
- [x] Rate limiting on `/auth/login`, `/auth/signup`, `/ai/ask` (429 verified)
- [x] FK / RLS-column indexes across all tables (database-reviewer)
- [x] Global `statement_timeout` + `idle_in_transaction_session_timeout`
- [x] Least privilege: `REVOKE ALL ON SCHEMA public FROM public`
- [x] Dependency audit reviewed (Next's bundled postcss advisory = accepted risk; force-fix downgrades Next 15→9)
- [ ] Observability (OpenTelemetry traces, Sentry, metrics/alerting)
- [ ] Automated backups + tested restore drills
- [ ] Staging environment + deploy pipeline to Hostinger VPS
- [ ] Security headers / CSP on web + API
- [ ] Redis-backed rate limiter (for multi-instance) + edge WAF
- [ ] PII column encryption (CNIC, payroll, biometric) + consent gates
- [ ] AI cost governance (per-tenant token budgets, kill-switch, caching)
- [ ] Move `claude/.claude/` skills+agents to project-root `.claude/` so they load as live skills/agents

---

## Changelog

| Commit | What |
|--------|------|
| `9718522` | Phase 0 — foundation shell (tenancy, auth, RLS, terminology) |
| `4b65b70` | Phase 1a — RBAC, team, section toggles, audit, app shell |
| `5907a03` | Phase 2 — CRM core (pipelines, leads, dedup, Kanban, interactions) |
| `5751b9c` | AI Gateway v1 — safe NL→SQL over CRM data |
| `91888d4` | Add living ROADMAP.md |
| `202e009` | Frontend design system — tokens, components, cohesive dark UI |
| `5f147da` | Phase 1b start — in-app notifications + bell + first won-deal automation |
| `b66e4a5` | Production hardening (rate limits, indexes, timeouts, least-privilege) |
| `2bb8aa8` | Competitive research + research-driven UX (KPIs, activation, AI prompts) |
| `f9b37a3` | Workflow/ECA engine + Automations builder UI |
| `9d822b4` | Mobile-responsive app shell (hamburger slide-over) |
| `8fa1b95` | CRM depth — industry-conditional post-sale fulfillment |
| `085d8d8` | CRM depth — invoice request → approve → PDF (separation of duties) |
| `5c074c4` | CRM depth — heuristic lead scoring with score pills |
