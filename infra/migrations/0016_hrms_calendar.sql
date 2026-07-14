-- ============================================================================
-- Migration 0016 — Working-day calendar for payroll
--
-- Payroll previously divided by a hardcoded WORKING_DAYS = 26 and counted
-- absences as `attendance.status = 'absent'` — a value no code path ever wrote,
-- so the absence deduction was structurally always zero.
--
-- Absence is now derived from evidence (a working day with no check-in and no
-- approved leave), which needs a real calendar: weekly rest day + holidays.
-- ============================================================================

create table if not exists hrms_holidays (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  holiday_date date not null,
  name         text not null,
  created_at   timestamptz not null default now(),
  unique (tenant_id, holiday_date)
);
create index if not exists hrms_holidays_tenant_idx on hrms_holidays(tenant_id, holiday_date);

-- Weekly rest day, as ISO dow (0=Sunday … 6=Saturday). Pakistan's private
-- sector is predominantly Mon–Sat with Sunday off, so 0 is the default; a
-- Mon–Fri office sets {0,6}.
alter table tenants
  add column if not exists weekly_off_days int[] not null default '{0}';

grant select, insert, delete on hrms_holidays to app_user;

alter table hrms_holidays enable row level security;
drop policy if exists tenant_isolation on hrms_holidays;
create policy tenant_isolation on hrms_holidays
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
