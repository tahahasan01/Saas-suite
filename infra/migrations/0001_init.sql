-- ============================================================================
-- Migration 0001 — Foundation: tenancy, auth, RBAC, terminology, entitlements
-- Security model:
--   * Tables are owned by the migration/owner role (bypasses RLS) — used ONLY
--     for signup + login-by-email lookups (operations with no tenant context).
--   * The API's runtime queries use the non-owner `app_user` role, to which RLS
--     IS enforced. Every tenant request runs inside a transaction that does
--     `SET LOCAL app.tenant_id = '<uuid>'`; RLS then filters every row.
-- ============================================================================

create extension if not exists "pgcrypto";  -- gen_random_uuid()
create extension if not exists vector;       -- pgvector (RAG, dedup, matching)

-- ── Runtime application role (non-owner → RLS applies to it) ────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login password 'app_user_pw';
  end if;
end$$;

-- ── Global reference data (NOT tenant-scoped) ──────────────────────────────
-- Terminology drives the industry re-skin. Same key, different label per industry.
create table if not exists terminology (
  id            uuid primary key default gen_random_uuid(),
  industry_type text not null,
  key           text not null,
  locale        text not null default 'en',
  label         text not null,
  created_at    timestamptz not null default now(),
  unique (industry_type, key, locale)
);

-- ── Tenants (the company registry) ─────────────────────────────────────────
create table if not exists tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  industry_type text not null,
  plan_id       text,
  status        text not null default 'active',
  settings      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Roles & permissions (per tenant) ───────────────────────────────────────
create table if not exists roles (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  is_system  boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists permissions (
  id       uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  role_id  uuid not null references roles(id) on delete cascade,
  section  text not null,          -- e.g. 'crm', 'pos', 'hrms', 'settings'
  action   text not null,          -- e.g. 'read', 'write', 'admin'
  unique (role_id, section, action)
);

-- ── Users ──────────────────────────────────────────────────────────────────
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  email         text not null,
  password_hash text not null,
  name          text not null default '',
  role_id       uuid references roles(id),
  status        text not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (email)                    -- globally unique → login without tenant hint
);
create index if not exists users_tenant_idx on users(tenant_id);

-- ── Sessions (self-hosted session auth) ────────────────────────────────────
create table if not exists sessions (
  id         text primary key,      -- opaque random token (stored hashed in prod)
  user_id    uuid not null references users(id) on delete cascade,
  tenant_id  uuid not null references tenants(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions(user_id);

-- ── Entitlements (which sections a tenant has turned on) ────────────────────
create table if not exists entitlements (
  tenant_id   uuid not null references tenants(id) on delete cascade,
  section_key text not null,        -- 'crm' | 'pos' | 'hrms'
  enabled     boolean not null default false,
  limits      jsonb not null default '{}'::jsonb,
  primary key (tenant_id, section_key)
);

-- ── Grants for the runtime role ────────────────────────────────────────────
grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant usage, select on all sequences in schema public to app_user;
alter default privileges in schema public
  grant select, insert, update, delete on tables to app_user;

-- ── Row-Level Security ─────────────────────────────────────────────────────
-- Helper: current tenant from the session GUC (NULL-safe → no rows when unset).
-- Policy pattern applied to every tenant-scoped table.
do $$
declare t text;
begin
  foreach t in array array['tenants','roles','permissions','users','sessions','entitlements']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end$$;

-- tenants: a tenant may only see its own row (keyed on id).
create policy tenant_self on tenants
  using (id = current_setting('app.tenant_id', true)::uuid)
  with check (id = current_setting('app.tenant_id', true)::uuid);

-- all other tenant-scoped tables: keyed on tenant_id.
create policy tenant_isolation on roles
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create policy tenant_isolation on permissions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create policy tenant_isolation on users
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create policy tenant_isolation on sessions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create policy tenant_isolation on entitlements
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
-- terminology has NO RLS: it is global reference data readable by everyone.
