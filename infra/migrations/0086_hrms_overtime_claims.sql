-- ============================================================================
-- Migration 0086 — Overtime claims, paid through payroll (wave A, H5, St10)
--
-- An employee claims overtime for a day, at most the minutes attendance
-- derived (hrms_attendance.overtime_min, 0066). A manager approves or
-- rejects it. Approval prices it once (payroll_engine.overtime_pay) and
-- creates an OVERTIME pay_one_offs row for the month, so payroll pays,
-- freezes and releases it exactly like any one-off (0070). One live claim
-- per employee and day; a rejected one may be made again.
-- ============================================================================

create table if not exists hrms_overtime_claims (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  employee_id     uuid not null references hrms_employees(id) on delete cascade,
  work_date       date not null,
  minutes         int not null check (minutes between 1 and 1440),
  reason          text not null default '' check (length(reason) <= 500),
  status          text not null default 'pending',
  rate_multiplier numeric(4,2) not null default 2.00 check (rate_multiplier between 1 and 5),
  amount_minor    bigint check (amount_minor >= 0),           -- set on approval
  one_off_id      uuid references pay_one_offs(id) on delete set null,
  decided_by      uuid references users(id) on delete set null,
  decided_at      timestamptz,
  decision_note   text not null default '' check (length(decision_note) <= 500),
  created_at      timestamptz not null default now()
);
create unique index if not exists hrms_overtime_claims_live_uq
  on hrms_overtime_claims (employee_id, work_date) where status <> 'rejected';
create index if not exists hrms_overtime_claims_tenant_idx on hrms_overtime_claims (tenant_id, status, work_date desc);

grant select, insert, update on hrms_overtime_claims to app_user;   -- decided, never deleted

alter table hrms_overtime_claims enable row level security;
drop policy if exists tenant_isolation on hrms_overtime_claims;
create policy tenant_isolation on hrms_overtime_claims
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table hrms_overtime_claims drop constraint if exists hrms_overtime_claims_status_check;
alter table hrms_overtime_claims add constraint hrms_overtime_claims_status_check
  check (status in ('pending', 'approved', 'rejected'));

drop trigger if exists audit on hrms_overtime_claims;
create trigger audit after insert or update on hrms_overtime_claims for each row
  execute function audit_row('employee_id','work_date','minutes','status','rate_multiplier','amount_minor',
                             'decided_by','decision_note');
