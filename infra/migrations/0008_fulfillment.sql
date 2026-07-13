-- ============================================================================
-- Migration 0008 — Post-sale fulfillment (industry-conditional)
-- One record per won lead. Fields vary by industry, so the values live in
-- jsonb; the field *schema* is served by the API per industry.
-- ============================================================================

create table if not exists crm_fulfillment (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  lead_id    uuid not null references crm_leads(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id)
);
create index if not exists crm_fulfillment_tenant_idx on crm_fulfillment(tenant_id);

grant select, insert, update, delete on crm_fulfillment to app_user;
alter table crm_fulfillment enable row level security;
create policy tenant_isolation on crm_fulfillment
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
