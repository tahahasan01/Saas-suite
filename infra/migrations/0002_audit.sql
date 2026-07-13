-- ============================================================================
-- Migration 0002 — Audit log (tenant-scoped, RLS-enforced)
-- Immutable trail of who changed what. Written by the app on every mutation.
-- ============================================================================

create table if not exists audit_log (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  actor_id   uuid references users(id) on delete set null,
  action     text not null,          -- e.g. 'user.create', 'entitlement.update'
  entity     text not null,          -- e.g. 'user', 'entitlement'
  entity_id  text,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_tenant_idx on audit_log(tenant_id, created_at desc);

grant select, insert on audit_log to app_user;

alter table audit_log enable row level security;
create policy tenant_isolation on audit_log
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
