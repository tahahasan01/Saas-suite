-- ============================================================================
-- Migration 0013 — Billing: subscriptions + payment requests
-- One subscription per tenant. Manual (bank-transfer) activation for Pakistan;
-- gateway (Safepay/PayFast) plugs in behind the same payment_requests flow.
-- ============================================================================

create table if not exists subscriptions (
  tenant_id          uuid primary key references tenants(id) on delete cascade,
  plan               text not null default 'starter',   -- starter | growth | enterprise
  status             text not null default 'trialing',   -- trialing | active | past_due | canceled
  trial_ends_at      timestamptz,
  current_period_end timestamptz,
  provider           text not null default 'manual',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists payment_requests (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  plan         text not null,
  amount_minor bigint not null,
  method       text not null default 'bank_transfer',
  reference    text not null default '',
  status       text not null default 'pending',   -- pending | paid | rejected
  created_at   timestamptz not null default now()
);
create index if not exists payment_requests_tenant_idx on payment_requests(tenant_id, status, created_at desc);

grant select, insert, update on subscriptions to app_user;
grant select, insert, update on payment_requests to app_user;

alter table subscriptions enable row level security;
create policy tenant_isolation on subscriptions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table payment_requests enable row level security;
create policy tenant_isolation on payment_requests
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Backfill existing tenants onto a trial so nothing breaks.
insert into subscriptions (tenant_id, plan, status, trial_ends_at)
select id, 'growth', 'trialing', now() + interval '14 days' from tenants
on conflict (tenant_id) do nothing;
