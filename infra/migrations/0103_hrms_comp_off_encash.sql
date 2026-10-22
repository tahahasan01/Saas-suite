-- ============================================================================
-- Migration 0103 — Compensatory leave and leave encashment (wave C, H8, St12)
--
--  * hrms_leave_ledger.entry gains 'comp_off' (days earned by working a day
--    off) and 'encash' (days turned into pay).
--  * hrms_comp_off_requests — the day worked (a weekly off day or holiday
--    with a check-in), 1 or 0.5 days, then the decision and the leave type
--    it was credited to. One live request per employee and day.
--  * hrms_leave_encashments — days, the per-day rate (base ÷ 30) and the
--    LEAVE_ENCASH one-off that pays them. Append-only.
-- ============================================================================

alter table hrms_leave_ledger drop constraint if exists hrms_leave_ledger_entry_check;
alter table hrms_leave_ledger add constraint hrms_leave_ledger_entry_check
  check (entry in ('grant', 'accrual', 'carry_in', 'carry_expire', 'taken', 'reversal', 'adjust', 'comp_off', 'encash'));

create table if not exists hrms_comp_off_requests (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  employee_id    uuid not null references hrms_employees(id) on delete cascade,
  work_date      date not null,
  days           numeric(3,1) not null check (days in (0.5, 1.0)),
  reason         text not null default '' check (length(reason) <= 500),
  status         text not null default 'pending',
  leave_type_id  uuid references hrms_leave_types(id),
  decided_by     uuid references users(id) on delete set null,
  decided_at     timestamptz,
  decision_note  text not null default '' check (length(decision_note) <= 500),
  created_at     timestamptz not null default now(),
  check ((status = 'approved') = (leave_type_id is not null)),
  check (status <> 'rejected' or length(btrim(decision_note)) > 0)
);
create unique index if not exists hrms_comp_off_live_uq
  on hrms_comp_off_requests (employee_id, work_date) where status <> 'rejected';
create index if not exists hrms_comp_off_tenant_idx on hrms_comp_off_requests (tenant_id, status, work_date desc);

create table if not exists hrms_leave_encashments (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  employee_id    uuid not null references hrms_employees(id) on delete cascade,
  leave_type_id  uuid not null references hrms_leave_types(id),
  days           numeric(6,1) not null check (days > 0),
  per_day_minor  bigint not null check (per_day_minor >= 0),
  amount_minor   bigint not null check (amount_minor >= 0),
  one_off_id     uuid references pay_one_offs(id) on delete set null,
  note           text not null default '' check (length(note) <= 500),
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists hrms_leave_encashments_emp_idx on hrms_leave_encashments (employee_id, created_at desc);

grant select, insert, update on hrms_comp_off_requests to app_user;   -- decided, never deleted
grant select, insert         on hrms_leave_encashments to app_user;   -- append-only

do $$
declare t text;
begin
  foreach t in array array['hrms_comp_off_requests','hrms_leave_encashments']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

alter table hrms_comp_off_requests drop constraint if exists hrms_comp_off_requests_status_check;
alter table hrms_comp_off_requests add constraint hrms_comp_off_requests_status_check
  check (status in ('pending', 'approved', 'rejected'));

drop trigger if exists audit on hrms_comp_off_requests;
create trigger audit after insert or update on hrms_comp_off_requests for each row
  execute function audit_row('employee_id','work_date','days','status','leave_type_id','decided_by');
drop trigger if exists audit on hrms_leave_encashments;
create trigger audit after insert on hrms_leave_encashments for each row
  execute function audit_row('employee_id','leave_type_id','days','amount_minor');
