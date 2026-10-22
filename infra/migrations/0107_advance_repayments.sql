-- ============================================================================
-- Migration 0107 — Paying off a loan or advance early (wave A leftover, H11)
--
-- pay_advance_repayments: money back outside the monthly instalments.
--  * cash     — paid to the company; any part of what is left.
--  * payroll  — the whole balance taken from the next salary: an
--               ADVANCE_SETTLE deduction one-off (0070); the advance closes.
-- What is still owed = principal − instalments in final runs − repayments
-- (a payroll repayment whose one-off was voided no longer counts).
-- ============================================================================

create table if not exists pay_advance_repayments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  advance_id    uuid not null references pay_advances(id) on delete cascade,
  method        text not null,
  amount_minor  bigint not null check (amount_minor > 0),
  one_off_id    uuid references pay_one_offs(id) on delete set null,
  note          text not null default '' check (length(note) <= 500),
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  check ((method = 'payroll') = (one_off_id is not null))
);
create index if not exists pay_advance_repayments_advance_idx on pay_advance_repayments (advance_id);

grant select, insert on pay_advance_repayments to app_user;   -- append-only

alter table pay_advance_repayments enable row level security;
drop policy if exists tenant_isolation on pay_advance_repayments;
create policy tenant_isolation on pay_advance_repayments
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table pay_advance_repayments drop constraint if exists pay_advance_repayments_method_check;
alter table pay_advance_repayments add constraint pay_advance_repayments_method_check
  check (method in ('cash', 'payroll'));

drop trigger if exists audit on pay_advance_repayments;
create trigger audit after insert on pay_advance_repayments for each row
  execute function audit_row('advance_id','method','amount_minor','one_off_id');
