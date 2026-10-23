-- ============================================================================
-- Migration 0109 — Overtime rates by kind of day (wave A leftover, H5, St10)
--
--  * hrms_overtime_rates — one row per company: the multiplier for ordinary
--    days, the weekly day off and public holidays. ×2 each (Factories Act
--    pattern) and unverified until the founder confirms them.
--  * hrms_overtime_claims.day_type — which of the three the claim was worked
--    on; the claim's rate_multiplier is taken from it when made.
-- ============================================================================

create table if not exists hrms_overtime_rates (
  tenant_id   uuid primary key references tenants(id) on delete cascade,
  normal      numeric(4,2) not null default 2.00 check (normal between 1 and 5),
  rest_day    numeric(4,2) not null default 2.00 check (rest_day between 1 and 5),
  holiday     numeric(4,2) not null default 2.00 check (holiday between 1 and 5),
  verified    boolean not null default false,
  updated_by  uuid references users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

grant select, insert, update on hrms_overtime_rates to app_user;

alter table hrms_overtime_rates enable row level security;
drop policy if exists tenant_isolation on hrms_overtime_rates;
create policy tenant_isolation on hrms_overtime_rates
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table hrms_overtime_claims add column if not exists day_type text not null default 'normal';
alter table hrms_overtime_claims drop constraint if exists hrms_overtime_claims_day_type_check;
alter table hrms_overtime_claims add constraint hrms_overtime_claims_day_type_check
  check (day_type in ('normal', 'rest_day', 'holiday'));

drop trigger if exists audit on hrms_overtime_rates;
create trigger audit after insert or update on hrms_overtime_rates for each row
  execute function audit_row('normal','rest_day','holiday','verified');
