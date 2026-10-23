-- ============================================================================
-- Migration 0123 — Sales targets (wave D, C16; study 12 §4)
--
--  * crm_targets: an amount to reach in a month, for one rep or the whole
--    company (user_id null), on one of three measures:
--      won_value  deals won in the month (their value);
--      invoiced   invoices issued in the month, less what was credited;
--      collected  payments received in the month.
--    Progress is worked out when read, never stored, so it can't drift.
--    Past months stay as history.
--  * One target per month, person (or company) and measure.
-- ============================================================================

create table crm_targets (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  month         date not null check (extract(day from month) = 1),
  user_id       uuid references users(id) on delete cascade,
  metric        text not null,
  amount_minor  bigint not null check (amount_minor > 0),
  created_by    uuid references users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint crm_targets_metric_check check (metric in ('won_value', 'invoiced', 'collected'))
);
create unique index crm_targets_one_key on crm_targets
  (tenant_id, month, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), metric);

grant select, insert, update, delete on crm_targets to app_user;

alter table crm_targets enable row level security;
create policy tenant_isolation on crm_targets
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
