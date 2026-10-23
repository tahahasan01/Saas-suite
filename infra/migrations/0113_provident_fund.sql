-- ============================================================================
-- Migration 0113 — Provident fund (for companies that run one instead of
-- gratuity; the "Office with a provident fund" preset of 0112)
--
--  * payroll_policies gains the company's fund rule: on or off, the
--    employee's and employer's rate (percent), on basic pay or gross, and the
--    months of service after which the employer's share belongs to them.
--    Rates are unverified like every other statutory figure.
--  * hrms_employees.pf_member / pf_joined_on — who is in the fund, from when.
--  * pay_pf_entries — money in or out of a member's fund outside payroll:
--    an opening balance, a withdrawal, the payout on leaving and the
--    unvested employer share forfeited then. Amounts are signed (out < 0).
--    Monthly contributions are the PF_EE / PF_ER payslip lines of final runs.
--  * hrms_final_settlement_lines may carry PF_PAYOUT.
-- ============================================================================

alter table payroll_policies
  add column if not exists pf_enabled        boolean not null default false,
  add column if not exists pf_employee_rate  numeric(5,2) not null default 0 check (pf_employee_rate between 0 and 30),
  add column if not exists pf_employer_rate  numeric(5,2) not null default 0 check (pf_employer_rate between 0 and 30),
  add column if not exists pf_base           text not null default 'basic',
  add column if not exists pf_vesting_months int not null default 0 check (pf_vesting_months between 0 and 240);
alter table payroll_policies drop constraint if exists payroll_policies_pf_base_check;
alter table payroll_policies add constraint payroll_policies_pf_base_check check (pf_base in ('basic', 'gross'));

alter table hrms_employees
  add column if not exists pf_member    boolean not null default false,
  add column if not exists pf_joined_on date;

create table if not exists pay_pf_entries (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  employee_id     uuid not null references hrms_employees(id) on delete cascade,
  kind            text not null,
  employee_minor  bigint not null default 0,
  employer_minor  bigint not null default 0,
  settlement_id   uuid references hrms_final_settlements(id) on delete set null,
  note            text not null default '' check (length(note) <= 500),
  created_by      uuid references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  check (employee_minor <> 0 or employer_minor <> 0)
);
create index if not exists pay_pf_entries_employee_idx on pay_pf_entries (employee_id, created_at);

grant select, insert on pay_pf_entries to app_user;   -- append-only: a mistake is corrected by a new entry

alter table pay_pf_entries enable row level security;
drop policy if exists tenant_isolation on pay_pf_entries;
create policy tenant_isolation on pay_pf_entries
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table pay_pf_entries drop constraint if exists pay_pf_entries_kind_check;
alter table pay_pf_entries add constraint pay_pf_entries_kind_check
  check (kind in ('opening', 'withdrawal', 'payout', 'forfeit', 'adjustment'));

alter table hrms_final_settlement_lines drop constraint if exists hrms_final_settlement_lines_code_check;
alter table hrms_final_settlement_lines add constraint hrms_final_settlement_lines_code_check
  check (code in ('GRATUITY', 'LEAVE_ENCASH', 'NOTICE_PAY', 'BONUS', 'OTHER', 'PF_PAYOUT',
                  'ADVANCE_SETTLE', 'ASSET_RECOVERY', 'NOTICE_SHORTFALL', 'OTHER_RECOVERY'));

drop trigger if exists audit on payroll_policies;
create trigger audit after insert or update on payroll_policies for each row
  execute function audit_row('encash_basis','gratuity_tax','gratuity_exempt_minor','preset','pf_enabled',
                             'pf_employee_rate','pf_employer_rate','pf_base','pf_vesting_months');
drop trigger if exists audit_pf on hrms_employees;
create trigger audit_pf after update on hrms_employees for each row
  execute function audit_row('pf_member','pf_joined_on');
drop trigger if exists audit on pay_pf_entries;
create trigger audit after insert on pay_pf_entries for each row
  execute function audit_row('employee_id','kind','employee_minor','employer_minor');
