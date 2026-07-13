-- ============================================================================
-- Migration 0007 — Workflow / ECA (Event-Condition-Action) automations
-- Tenant-configurable rules. Conditions/actions are declarative JSON evaluated
-- by a sandboxed engine (no arbitrary code). RLS-scoped.
-- ============================================================================

create table if not exists workflows (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  trigger    text not null,               -- e.g. 'lead.stage_changed'
  conditions jsonb not null default '[]'::jsonb,  -- [{field, op, value}]
  actions    jsonb not null default '[]'::jsonb,  -- [{type, ...params}]
  enabled    boolean not null default true,
  is_system  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists workflows_tenant_trigger_idx on workflows(tenant_id, trigger) where enabled;

grant select, insert, update, delete on workflows to app_user;
alter table workflows enable row level security;
create policy tenant_isolation on workflows
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
