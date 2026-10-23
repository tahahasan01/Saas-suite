-- ============================================================================
-- Migration 0111 — Emailing payslips from a run (research sweep; TRD
-- POST /payroll/runs/{id}/payslips/send; WhatsApp waits for Phase 4)
--
-- pay_payslip_sends: one row per payslip emailed: to which address, the
-- email outbox row that carries it, and who sent it. A payslip is sent once
-- unless sending is asked for again. Append-only.
-- ============================================================================

create table if not exists pay_payslip_sends (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  payslip_id   uuid not null references payslips(id) on delete cascade,
  run_id       uuid not null references payroll_runs(id) on delete cascade,
  employee_id  uuid not null references hrms_employees(id) on delete cascade,
  email        text not null,
  outbox_id    bigint,
  sent_by      uuid references users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists pay_payslip_sends_payslip_idx on pay_payslip_sends (payslip_id);
create index if not exists pay_payslip_sends_run_idx on pay_payslip_sends (run_id);

grant select, insert on pay_payslip_sends to app_user;   -- append-only

alter table pay_payslip_sends enable row level security;
drop policy if exists tenant_isolation on pay_payslip_sends;
create policy tenant_isolation on pay_payslip_sends
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

drop trigger if exists audit on pay_payslip_sends;
create trigger audit after insert on pay_payslip_sends for each row
  execute function audit_row('payslip_id','employee_id','email');
