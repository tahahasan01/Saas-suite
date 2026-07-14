-- ============================================================================
-- Migration 0021 — Leave policy (annual quotas)
--
-- Approving leave previously affected nothing but a status string: no balance,
-- no quota, nothing stopped approving 400 days of annual leave. Balances are
-- derived (quota minus approved working days this year), never stored — a
-- counter that must be maintained is a counter that drifts, which is how the
-- always-zero payroll deduction happened.
--
-- Defaults follow common Pakistani practice (Shops & Establishments Ordinance
-- shape): 14 annual / 10 sick / 10 casual. Unpaid leave and WFH carry no quota —
-- unpaid is already deducted from pay, and WFH is worked time.
-- ============================================================================

create table if not exists hrms_leave_policies (
  tenant_id   uuid primary key references tenants(id) on delete cascade,
  annual_days int not null default 14,
  sick_days   int not null default 10,
  casual_days int not null default 10,
  updated_at  timestamptz not null default now()
);

grant select, insert, update on hrms_leave_policies to app_user;

alter table hrms_leave_policies enable row level security;
drop policy if exists tenant_isolation on hrms_leave_policies;
create policy tenant_isolation on hrms_leave_policies
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
