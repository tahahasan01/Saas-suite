# Business OS

Unified, AI-powered, all-in-one B2B SaaS platform (**HRMS + CRM + POS in one app**),
industry-localized and multi-tenant. Pakistan-first. See [`PROJECT_PLAN.md`](./PROJECT_PLAN.md)
and [`docs/`](./docs) for the full plan; the active build plan lives in the approved plan file.

## Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI (Python) — also hosts AI/ML |
| Frontend | Next.js + React + Tailwind |
| Database | PostgreSQL 16 + Row-Level Security + PGVector |
| Cache/Jobs | Redis |
| Auth | Self-hosted session auth (argon2 + cookies) |

## Monorepo layout

```
apps/web            Next.js unified app (localized shell, onboarding, dashboard)
services/api        FastAPI backend (auth, tenancy, terminology, entitlements)
packages/types      Shared TS domain types / API contract
infra/docker        Postgres (pgvector) + Redis compose
infra/migrations    Raw-SQL migrations (RLS policies)
```

## Local development

Prereqs: Docker Desktop, Node 20+, Python 3.12.

```bash
cp .env.example .env                      # then edit secrets

# 1. Infra
npm install
npm run db:up                             # Postgres :5433, Redis :6379

# 2. Backend
cd services/api
python -m venv .venv
./.venv/Scripts/python -m pip install -r requirements.txt   # (Scripts on Windows, bin on *nix)
./.venv/Scripts/python -m scripts.migrate
./.venv/Scripts/python -m scripts.seed
./.venv/Scripts/python -m uvicorn app.main:app --port 4000 --reload

# 3. Frontend (new terminal, repo root)
npm run dev --workspace @business-os/web  # http://localhost:3000
```

## Security model (multi-tenancy)

Every tenant-scoped table carries `tenant_id` and is protected by Postgres **Row-Level Security**.
The API uses two DB roles: an **owner** role for signup/login lookups (no tenant context yet), and
a non-owner **app_user** role for all runtime queries — every request runs inside a transaction that
sets `app.tenant_id`, so RLS filters every row. Cross-tenant reads are blocked by the database, not
just the application.
