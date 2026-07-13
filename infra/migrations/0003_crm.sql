-- ============================================================================
-- Migration 0003 — CRM: pipelines, stages, leads, interactions
-- The "lead" is the industry-relabeled core record (Student/Customer/Client…).
-- pg_trgm powers fuzzy duplicate detection on company/name.
-- ============================================================================

create extension if not exists pg_trgm;

create table if not exists crm_pipelines (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists crm_stages (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  pipeline_id uuid not null references crm_pipelines(id) on delete cascade,
  name        text not null,
  position    int  not null default 0,
  kind        text not null default 'active',   -- 'active' | 'won' | 'lost'
  created_at  timestamptz not null default now()
);
create index if not exists crm_stages_pipeline_idx on crm_stages(pipeline_id, position);

create table if not exists crm_leads (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  pipeline_id  uuid not null references crm_pipelines(id) on delete cascade,
  stage_id     uuid not null references crm_stages(id),
  owner_id     uuid references users(id) on delete set null,
  name         text not null,
  company      text not null default '',
  phone        text not null default '',
  email        text not null default '',
  source       text not null default 'manual',   -- manual|whatsapp|facebook|google|referral
  value_minor  bigint not null default 0,         -- deal value, minor units
  currency     text not null default 'PKR',
  score        int,                               -- 0-100, set by AI later
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists crm_leads_pipeline_idx on crm_leads(pipeline_id, stage_id);
create index if not exists crm_leads_phone_idx on crm_leads(tenant_id, phone);
create index if not exists crm_leads_email_idx on crm_leads(tenant_id, email);
create index if not exists crm_leads_company_trgm on crm_leads using gin (company gin_trgm_ops);

create table if not exists crm_interactions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  lead_id        uuid not null references crm_leads(id) on delete cascade,
  user_id        uuid references users(id) on delete set null,
  channel        text not null default 'note',    -- call|whatsapp|email|note|bot
  outcome        text,                              -- interested|not_interested|callback|busy
  note           text not null default '',
  next_follow_up_at timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists crm_interactions_lead_idx on crm_interactions(lead_id, created_at desc);

-- Grants + RLS
grant select, insert, update, delete on
  crm_pipelines, crm_stages, crm_leads, crm_interactions to app_user;

do $$
declare t text;
begin
  foreach t in array array['crm_pipelines','crm_stages','crm_leads','crm_interactions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;
