-- ============================================================================
-- Migration 0102 — Expense claims reimbursed through payroll (wave C, H13, St12)
--
--  * hrms_expense_claims — one claim: who it's for, who entered it, the
--    claimed total, then the decision. Approval (up to the total) creates a
--    non-taxable EXPENSE pay_one_offs row, so payroll pays, freezes and
--    releases it like any one-off (0070); "paid" is read from that run.
--  * hrms_expense_lines — date, category, description, amount and an
--    optional receipt (a files row the claimant uploaded, 0057).
-- ============================================================================

create table if not exists hrms_expense_claims (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  employee_id     uuid not null references hrms_employees(id) on delete cascade,
  title           text not null check (length(btrim(title)) between 1 and 160),
  status          text not null default 'submitted',
  total_minor     bigint not null check (total_minor > 0),
  approved_minor  bigint check (approved_minor > 0),
  one_off_id      uuid references pay_one_offs(id) on delete set null,
  submitted_by    uuid references users(id) on delete set null,
  decided_by      uuid references users(id) on delete set null,
  decided_at      timestamptz,
  decision_note   text not null default '' check (length(decision_note) <= 500),
  created_at      timestamptz not null default now(),
  check (approved_minor is null or approved_minor <= total_minor),
  check ((status = 'approved') = (approved_minor is not null)),
  check (status <> 'rejected' or length(btrim(decision_note)) > 0)
);
create index if not exists hrms_expense_claims_tenant_idx on hrms_expense_claims (tenant_id, status, created_at desc);
create index if not exists hrms_expense_claims_employee_idx on hrms_expense_claims (employee_id, created_at desc);

create table if not exists hrms_expense_lines (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  claim_id         uuid not null references hrms_expense_claims(id) on delete cascade,
  spent_on         date not null,
  category         text not null default 'other',
  description      text not null default '' check (length(description) <= 300),
  amount_minor     bigint not null check (amount_minor > 0),
  receipt_file_id  uuid references files(id) on delete set null,
  sort             int not null default 0
);
create index if not exists hrms_expense_lines_claim_idx on hrms_expense_lines (claim_id, sort);

grant select, insert, update on hrms_expense_claims to app_user;   -- decided or cancelled, never deleted
grant select, insert         on hrms_expense_lines  to app_user;   -- fixed once claimed

do $$
declare t text;
begin
  foreach t in array array['hrms_expense_claims','hrms_expense_lines']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

alter table hrms_expense_claims drop constraint if exists hrms_expense_claims_status_check;
alter table hrms_expense_claims add constraint hrms_expense_claims_status_check
  check (status in ('submitted', 'approved', 'rejected', 'cancelled'));
alter table hrms_expense_lines drop constraint if exists hrms_expense_lines_category_check;
alter table hrms_expense_lines add constraint hrms_expense_lines_category_check
  check (category in ('travel', 'fuel', 'meals', 'phone', 'supplies', 'medical', 'accommodation', 'other'));

drop trigger if exists audit on hrms_expense_claims;
create trigger audit after insert or update on hrms_expense_claims for each row
  execute function audit_row('employee_id','title','status','total_minor','approved_minor','decided_by','decision_note');
