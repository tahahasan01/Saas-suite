-- ============================================================================
-- Migration 0104 — Final settlement and gratuity (wave C, H12, St12)
--
--  * payroll_gratuity_settings — one row per company: whether gratuity is
--    paid, days' wages per year of service, the minimum service and when a
--    part year counts as a full one. Off and unverified until the founder
--    checks the rule (St12 §5).
--  * hrms_final_settlements — one live settlement per leaver: draft →
--    approved → paid (or cancelled). Approval books its lines as one-offs in
--    `pay_month`; it is paid when that payroll run is paid.
--  * hrms_final_settlement_lines — payables (GRATUITY, LEAVE_ENCASH,
--    NOTICE_PAY, BONUS, OTHER) and receivables (ADVANCE_SETTLE,
--    ASSET_RECOVERY, NOTICE_SHORTFALL, OTHER_RECOVERY). `auto` lines are
--    rebuilt by a recalculation; hand-added ones are kept.
-- ============================================================================

create table if not exists payroll_gratuity_settings (
  tenant_id           uuid primary key references tenants(id) on delete cascade,
  enabled             boolean not null default false,
  days_per_year       int not null default 30 check (days_per_year between 1 and 60),
  min_service_months  int not null default 12 check (min_service_months between 0 and 120),
  part_year_months    int not null default 6 check (part_year_months between 0 and 11),
  verified            boolean not null default false,
  note                text not null default '' check (length(note) <= 500),
  updated_by          uuid references users(id) on delete set null,
  updated_at          timestamptz not null default now()
);

create table if not exists hrms_final_settlements (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  employee_id       uuid not null references hrms_employees(id) on delete cascade,
  last_working_day  date not null,
  status            text not null default 'draft',
  service_years     int not null default 0,
  pay_month         date check (pay_month is null or extract(day from pay_month) = 1),
  note              text not null default '' check (length(note) <= 1000),
  created_by        uuid references users(id) on delete set null,
  created_at        timestamptz not null default now(),
  approved_by       uuid references users(id) on delete set null,
  approved_at       timestamptz,
  paid_at           timestamptz,
  cancelled_at      timestamptz,
  check ((status in ('approved', 'paid')) = (pay_month is not null))
);
create unique index if not exists hrms_final_settlements_live_uq
  on hrms_final_settlements (employee_id) where status <> 'cancelled';
create index if not exists hrms_final_settlements_tenant_idx on hrms_final_settlements (tenant_id, status);

create table if not exists hrms_final_settlement_lines (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  settlement_id  uuid not null references hrms_final_settlements(id) on delete cascade,
  kind           text not null,
  code           text not null,
  name           text not null check (length(btrim(name)) between 1 and 120),
  amount_minor   bigint not null check (amount_minor > 0),
  taxable        boolean not null default false,
  auto           boolean not null default false,
  ref_id         uuid,                      -- the advance, asset or leave type it came from
  days           numeric(6,1),              -- encashed leave days
  explain        jsonb not null default '{}',
  one_off_id     uuid references pay_one_offs(id) on delete set null,
  sort           int not null default 0
);
create index if not exists hrms_final_settlement_lines_idx on hrms_final_settlement_lines (settlement_id, sort);

grant select, insert, update         on payroll_gratuity_settings   to app_user;
grant select, insert, update         on hrms_final_settlements      to app_user;   -- cancelled, never deleted
grant select, insert, update, delete on hrms_final_settlement_lines to app_user;   -- edited while a draft

do $$
declare t text;
begin
  foreach t in array array['payroll_gratuity_settings','hrms_final_settlements','hrms_final_settlement_lines']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

alter table hrms_final_settlements drop constraint if exists hrms_final_settlements_status_check;
alter table hrms_final_settlements add constraint hrms_final_settlements_status_check
  check (status in ('draft', 'approved', 'paid', 'cancelled'));
alter table hrms_final_settlement_lines drop constraint if exists hrms_final_settlement_lines_kind_check;
alter table hrms_final_settlement_lines add constraint hrms_final_settlement_lines_kind_check
  check (kind in ('payable', 'receivable'));
alter table hrms_final_settlement_lines drop constraint if exists hrms_final_settlement_lines_code_check;
alter table hrms_final_settlement_lines add constraint hrms_final_settlement_lines_code_check
  check (code in ('GRATUITY', 'LEAVE_ENCASH', 'NOTICE_PAY', 'BONUS', 'OTHER',
                  'ADVANCE_SETTLE', 'ASSET_RECOVERY', 'NOTICE_SHORTFALL', 'OTHER_RECOVERY'));

drop trigger if exists audit on payroll_gratuity_settings;
create trigger audit after insert or update on payroll_gratuity_settings for each row
  execute function audit_row('enabled','days_per_year','min_service_months','part_year_months','verified');
drop trigger if exists audit on hrms_final_settlements;
create trigger audit after insert or update on hrms_final_settlements for each row
  execute function audit_row('employee_id','status','last_working_day','pay_month','approved_by');
drop trigger if exists audit on hrms_final_settlement_lines;
create trigger audit after insert or update or delete on hrms_final_settlement_lines for each row
  execute function audit_row('settlement_id','kind','code','amount_minor','taxable');
