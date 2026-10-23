-- ============================================================================
-- Migration 0112 — Pay policies each company sets (the product is sold to many
-- companies whose rules differ; these were fixed in code before)
--
--  * payroll_policies — one row per company:
--      encash_basis   per-day pay for encashed leave: days_30 (salary ÷ 30),
--                     days_26, or working_days (that month's working days);
--      gratuity_tax   taxed | exempt | exempt_up_to (gratuity_exempt_minor);
--      preset         the preset it was last set from (null = never).
--  * hrms_leave_types.paid_on_leaving — whether a final settlement pays the
--    remaining days out. Annual leave yes, others no, until a company says.
-- Past payslips and settlements keep the numbers they were made with.
-- ============================================================================

create table if not exists payroll_policies (
  tenant_id              uuid primary key references tenants(id) on delete cascade,
  encash_basis           text not null default 'days_30',
  gratuity_tax           text not null default 'taxed',
  gratuity_exempt_minor  bigint check (gratuity_exempt_minor > 0),
  preset                 text,
  updated_by             uuid references users(id) on delete set null,
  updated_at             timestamptz not null default now(),
  check ((gratuity_tax = 'exempt_up_to') = (gratuity_exempt_minor is not null))
);

grant select, insert, update on payroll_policies to app_user;

alter table payroll_policies enable row level security;
drop policy if exists tenant_isolation on payroll_policies;
create policy tenant_isolation on payroll_policies
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table payroll_policies drop constraint if exists payroll_policies_encash_basis_check;
alter table payroll_policies add constraint payroll_policies_encash_basis_check
  check (encash_basis in ('days_30', 'days_26', 'working_days'));
alter table payroll_policies drop constraint if exists payroll_policies_gratuity_tax_check;
alter table payroll_policies add constraint payroll_policies_gratuity_tax_check
  check (gratuity_tax in ('taxed', 'exempt', 'exempt_up_to'));
alter table payroll_policies drop constraint if exists payroll_policies_preset_check;
alter table payroll_policies add constraint payroll_policies_preset_check
  check (preset is null or preset in ('standing_orders', 'provident_fund', 'small_business'));

alter table hrms_leave_types add column if not exists paid_on_leaving boolean;
update hrms_leave_types set paid_on_leaving = (code = 'annual') where paid_on_leaving is null;
alter table hrms_leave_types alter column paid_on_leaving set not null;
-- Types seeded later (hrms_seed_leave_types) or added by hand: annual leave is
-- paid out on leaving unless the company says otherwise.
create or replace function hrms_leave_type_paid_on_leaving() returns trigger language plpgsql as
$$
begin
  new.paid_on_leaving := coalesce(new.paid_on_leaving, new.code = 'annual');
  return new;
end
$$;
drop trigger if exists paid_on_leaving_default on hrms_leave_types;
create trigger paid_on_leaving_default before insert on hrms_leave_types for each row
  execute function hrms_leave_type_paid_on_leaving();

drop trigger if exists audit on payroll_policies;
create trigger audit after insert or update on payroll_policies for each row
  execute function audit_row('encash_basis','gratuity_tax','gratuity_exempt_minor','preset');
