-- ============================================================================
-- Migration 0009 — Invoice requests (sales requests → accounts approves → PDF)
-- Enforces separation of duties: sales can request but not approve; approval
-- needs the 'accounts' permission. PDF is generated on demand from this record.
-- ============================================================================

create table if not exists crm_invoice_requests (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  lead_id      uuid not null references crm_leads(id) on delete cascade,
  requested_by uuid references users(id) on delete set null,
  amount_minor bigint not null,
  discount_pct numeric(5,2) not null default 0,
  notes        text not null default '',
  status       text not null default 'pending',   -- pending | approved | rejected
  decided_by   uuid references users(id) on delete set null,
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists invoice_req_tenant_idx on crm_invoice_requests(tenant_id, status, created_at desc);
create index if not exists invoice_req_lead_idx on crm_invoice_requests(lead_id);
create index if not exists invoice_req_requester_idx on crm_invoice_requests(requested_by);

grant select, insert, update, delete on crm_invoice_requests to app_user;
alter table crm_invoice_requests enable row level security;
create policy tenant_isolation on crm_invoice_requests
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Backfill: existing Owner roles gain the 'accounts' approval permission.
insert into permissions (tenant_id, role_id, section, action)
select tenant_id, id, 'accounts', 'admin' from roles where name = 'Owner'
on conflict (role_id, section, action) do nothing;
