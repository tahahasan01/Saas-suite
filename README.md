<div align="center">

# ⬢ Business OS

### The all-in-one, AI-powered operating system for your business

**CRM · POS · HRMS — in one app, that speaks your industry's language.**

<br/>

[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js%2015-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Python](https://img.shields.io/badge/Python%203.12-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL%2016-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Claude](https://img.shields.io/badge/AI-Claude-D97757?logo=anthropic&logoColor=white)](https://www.anthropic.com/)

![Status](https://img.shields.io/badge/status-active%20development-success)
![Apps](https://img.shields.io/badge/apps-CRM%20·%20POS%20·%20HRMS-6366f1)
![Tests](https://img.shields.io/badge/tests-21%20passing-brightgreen)
![Market](https://img.shields.io/badge/market-Pakistan%20first-01411C)

</div>

---

## 🧭 What is this?

Most businesses juggle a separate app for sales, another for billing, another for staff — none of
which talk to each other, half of which never get adopted because they're too complex.

**Business OS is one modular platform.** A company activates only the modules it needs, and the
**entire interface re-labels itself to that industry** — a school sees *"Students,"* a shop sees
*"Customers,"* a clinic sees *"Patients."* Every action can be done the **manual way** (fast forms +
keyboard) or the **AI way** (just ask). The AI isn't a chatbot bolted on — it's an **active business
consultant** that scores leads, forecasts demand, and catches fraud across every module.

> **The wedge:** all-in-one + AI-native + **WhatsApp-first** + industry-localized + **flat PKR pricing**
> (no per-seat gouging) — exactly where Zoho / Odoo / Bitrix / HubSpot are weak in emerging markets.

---

## ✨ Highlights

| | Module | What it does |
|---|---|---|
| 🤝 | **CRM** | Drag-drop Kanban pipeline · fuzzy dedup · interaction logging · **lead scoring (1–100)** · industry-conditional fulfillment · **invoice → approve → PDF** (separation of duties) |
| 🛒 | **POS** | Keyboard-first billing (F1–F7) · barcode lookup · printable receipt · live stock · **predictive inventory** (velocity restock + **60-day seasonal forecast** — *"stock before Eid"*) |
| 👥 | **HRMS** | Employees · attendance with **mock-GPS anti-fraud flag** · leave approvals · **payroll with FBR tax slabs** |
| 🧠 | **AI Gateway** | One assistant everywhere — safe **NL→SQL** over tenant-scoped read-only views (injection-hardened) |
| ⚙️ | **Platform** | Multi-tenant · self-hosted auth · RBAC · module entitlements · **terminology engine** · workflow/ECA automations · notifications · audit log |

---

## 🏗️ Architecture

```mermaid
flowchart TB
    subgraph Client
        WEB["Next.js 15 web app<br/>(mobile-responsive)"]
    end
    subgraph API["FastAPI backend (modular monolith)"]
        direction TB
        PLAT["Platform<br/>tenancy · auth · RBAC · entitlements<br/>terminology · workflow · notifications · audit"]
        APPS["Apps<br/>CRM · POS · HRMS"]
        AI["AI Gateway<br/>safe NL→SQL · scoring · forecast"]
    end
    subgraph Data
        PG[("PostgreSQL 16<br/>Row-Level Security + PGVector")]
        REDIS[("Redis")]
    end
    WEB -->|"cookie session"| API
    APPS --> PLAT
    AI --> PLAT
    API -->|"RLS-scoped · app_user role"| PG
    API --> REDIS
    AI -.->|"read-only views only"| PG
    API -.->|"Claude"| LLM["Anthropic API"]
    API -.->|"WhatsApp Cloud API"| WA["WhatsApp"]
```

**Security by design:** every tenant-scoped table is protected by **Postgres Row-Level Security**.
Two DB roles — an owner (signup/login only) and a non-owner `app_user` for all runtime queries, where
each request sets `app.tenant_id` so the database *itself* blocks cross-tenant reads. The AI can only
touch curated, read-only, security-invoker views — never raw tables.

---

## 🧱 Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Backend** | FastAPI (Python 3.12), asyncpg | One service also hosts AI/ML |
| **Frontend** | Next.js 15, React 19, Tailwind v4 | Typed, fast, design-token system |
| **Database** | PostgreSQL 16 + RLS + PGVector | Relational + vector, tenant isolation |
| **Cache** | Redis | Sessions, jobs, geo |
| **Auth** | Self-hosted sessions (argon2 + httpOnly cookie) | Full data ownership |
| **AI** | Claude (Anthropic) | The "active consultant" |
| **PDF** | fpdf2 | On-demand invoices |
| **Infra** | Docker Compose · Cloudflare · Hostinger VPS | Cost-efficient, scale-ready |

---

## 🚀 Quick start

**Prereqs:** Docker Desktop · Node 20+ · Python 3.12

```bash
# 1 — clone & configure
git clone https://github.com/tahahasan01/Saas-suite.git && cd Saas-suite
cp .env.example .env          # then edit secrets

# 2 — infra (Postgres :5433, Redis :6379)
npm install
npm run db:up

# 3 — backend
cd services/api
python -m venv .venv
./.venv/Scripts/python -m pip install -r requirements.txt   # (Scripts on Windows, bin on *nix)
./.venv/Scripts/python -m scripts.migrate
./.venv/Scripts/python -m scripts.seed
./.venv/Scripts/python -m uvicorn app.main:app --port 4000 --reload

# 4 — frontend (new terminal, repo root)
npm run dev --workspace @business-os/web     # → http://localhost:3000
```

Sign up, pick an industry, and watch the UI re-label itself. 🎉

---

## 🗂️ Project structure

```
apps/web            Next.js unified app (all modules render here)
services/api        FastAPI backend
  app/platform      tenancy · auth · rbac · terminology · workflow · notifications
  app/routers       crm · pos · hrms · invoices · ai · workflows · team
  app/ai            AI gateway + NL→SQL guard
  tests             pytest (sql-guard · scoring · payroll · RLS)
packages/types      shared TS domain types
infra/docker        Postgres (pgvector) + Redis
infra/migrations    raw-SQL migrations (RLS policies)
docs/               architecture · strategy · competitive research
```

---

## ✅ Testing

```bash
cd services/api && ./.venv/Scripts/python -m pytest -q     # 21 passing
```

Covers the security- and money-critical paths: **NL→SQL injection defense**, lead scoring,
**FBR payroll math**, and **RLS cross-tenant isolation** — all run in CI on every push.

---

## 🗺️ Roadmap

| Phase | Status |
|-------|--------|
| Platform · CRM (+depth) · POS (+predictive inventory) · HRMS (+payroll) | ✅ Done |
| AI Gateway (live answers) | 🟡 Built — needs `ANTHROPIC_API_KEY` |
| WhatsApp channel (the wedge) | 🟡 Built — needs `WHATSAPP_TOKEN` |
| POS offline-first + hardware bridge · mobile attendance (face-match) | ⬜ Planned |

Full living checklist → [`ROADMAP.md`](./ROADMAP.md) · design docs → [`docs/`](./docs)

---

<div align="center">

**Built with a platform-first architecture so a fourth app is ~40% cheaper than the first.**

<sub>Multi-tenant · Row-Level-Security-isolated · industry-localized · AI-native</sub>

</div>
