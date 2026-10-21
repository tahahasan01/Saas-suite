-- ============================================================================
-- Migration 0070 — Pay components, structures, one-offs, advances and saved
-- payroll runs (D-40, St03 §6.5, checklist 3F, gate M6)
--
--  * pay_components / pay_structures / pay_structure_lines: an earning or
--    deduction is fixed, a percent of another code, or a formula in the tiny
--    language of app/payroll_formula.py (validated, cycle-checked at save).
--    hrms_compensation.structure_id says which structure a salary row uses.
--  * pay_one_offs (bonus, arrears, fine) and pay_advances (recovered in
--    instalments; what is outstanding is derived from the ADVANCE lines of
--    approved runs, never a counter that can drift).
--  * payroll_runs: draft → calculating → review → approved → paid → locked,
--    plus cancelled and failed. The allowed transitions are enforced HERE as
--    well as in the API, and a locked or cancelled run never changes again.
--    One regular run per month (partial unique index); corrections after
--    lock are `kind = 'adjustment'` runs, never edits.
--  * payslips (frozen snapshot of the employee at calculation) and
--    payslip_lines (with `explain`): written only while their run is
--    `calculating` — a trigger refuses any insert, update or delete
--    otherwise, for every role including the owner. Cascades from deleting a
--    tenant are let through (pg_trigger_depth() > 1).
--  * payroll_run_events: append-only history of every transition.
--  * scheduled job `payroll.calculate` (app/jobs.py): batches of 100
--    employees, idempotent per run, progress on the run row (St03 risk 9).
-- ============================================================================

-- ── Components and structures ───────────────────────────────────────────────
create table if not exists pay_components (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  code         text not null check (code ~ '^[A-Z][A-Z0-9_]{0,23}$'),
  name         text not null,
  kind         text not null default 'earning',
  calc         text not null default 'fixed',
  amount_minor bigint not null default 0 check (amount_minor >= 0),
  percent      numeric(7,4) check (percent is null or percent >= 0),
  percent_of   text not null default 'BASE',
  formula      text not null default '' check (length(formula) <= 500),
  taxable      boolean not null default true,
  prorate      boolean not null default true,     -- scaled for joiners/leavers
  sort         int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (tenant_id, code),
  constraint pay_components_kind_check check (kind in ('earning', 'deduction')),
  constraint pay_components_calc_check check (calc in ('fixed', 'percent', 'formula'))
);

create table if not exists pay_structures (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists pay_structure_lines (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  structure_id uuid not null references pay_structures(id) on delete cascade,
  component_id uuid not null references pay_components(id),
  sort         int not null default 0,
  unique (structure_id, component_id)
);

alter table hrms_compensation add column if not exists structure_id uuid references pay_structures(id);

-- ── Runs ────────────────────────────────────────────────────────────────────
create table if not exists payroll_runs (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  number         text not null default '',
  kind           text not null default 'regular',
  purpose        text not null default 'payroll',
  period_start   date not null,
  period_end     date not null,
  pay_date       date not null,
  tax_year       text not null default '',
  status         text not null default 'draft',
  adjusts_run_id uuid references payroll_runs(id),
  employee_ids   uuid[],                       -- null = every active employee
  meta           jsonb not null default '{}',
  progress_done  int not null default 0,
  progress_total int not null default 0,
  totals         jsonb not null default '{}',
  error          text not null default '',
  note           text not null default '',
  created_by     uuid references users(id) on delete set null,
  calculated_at  timestamptz,
  approved_by    uuid references users(id) on delete set null,
  approved_at    timestamptz,
  paid_at        timestamptz,
  locked_at      timestamptz,
  cancelled_at   timestamptz,
  cancel_reason  text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (period_end >= period_start),
  constraint payroll_runs_kind_check check (kind in ('regular', 'adjustment')),
  constraint payroll_runs_purpose_check check (purpose in ('payroll', 'correction', 'recompute_tax_year')),
  constraint payroll_runs_status_check check (status in ('draft', 'calculating', 'review', 'approved', 'paid',
                                                         'locked', 'cancelled', 'failed'))
);
create unique index if not exists payroll_runs_one_regular_per_month
  on payroll_runs (tenant_id, period_start) where kind = 'regular' and status <> 'cancelled';
create unique index if not exists payroll_runs_one_recompute_per_tax_year
  on payroll_runs (tenant_id, tax_year) where purpose = 'recompute_tax_year' and status <> 'cancelled';
create index if not exists payroll_runs_calculating on payroll_runs (status) where status = 'calculating';

create table if not exists payslips (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id) on delete cascade,
  run_id               uuid not null references payroll_runs(id) on delete cascade,
  employee_id          uuid not null references hrms_employees(id),
  snapshot             jsonb not null default '{}',   -- the employee as they were at calculation
  period_days          int not null default 0,
  employed_days        int not null default 0,
  working_days         int not null default 0,
  present_days         int not null default 0,
  paid_leave_days      int not null default 0,
  unpaid_leave_days    int not null default 0,
  wfh_days             int not null default 0,
  absent_days          int not null default 0,
  half_days            int not null default 0,
  gross_minor          bigint not null default 0,
  deductions_minor     bigint not null default 0,
  employer_cost_minor  bigint not null default 0,
  net_minor            bigint not null default 0,
  taxable_minor        bigint not null default 0,
  tax_minor            bigint not null default 0,
  taxable_ytd_minor    bigint not null default 0,
  tax_ytd_minor        bigint not null default 0,
  projected_annual_taxable_minor bigint not null default 0,
  annual_tax_minor     bigint not null default 0,
  tax_year             text not null default '',
  tax_verified         boolean not null default true,
  statutory_verified   boolean not null default true,
  warnings             jsonb not null default '[]',
  notes                jsonb not null default '[]',
  error                text not null default '',
  created_at           timestamptz not null default now(),
  unique (run_id, employee_id)
);
create index if not exists payslips_employee_idx on payslips (employee_id, created_at desc);

create table if not exists payslip_lines (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  payslip_id   uuid not null references payslips(id) on delete cascade,
  run_id       uuid not null references payroll_runs(id) on delete cascade,
  employee_id  uuid not null references hrms_employees(id),
  code         text not null,
  name         text not null,
  kind         text not null,
  amount_minor bigint not null,
  taxable      boolean not null default false,
  recurring    boolean not null default true,
  ref_id       uuid,                 -- the one-off or advance this line came from
  sort         int not null default 0,
  explain      jsonb not null default '{}',
  constraint payslip_lines_kind_check check (kind in ('earning', 'deduction', 'employer_contribution', 'info'))
);
create index if not exists payslip_lines_payslip_idx on payslip_lines (payslip_id, sort);
create index if not exists payslip_lines_ref_idx on payslip_lines (ref_id) where ref_id is not null;

create table if not exists payroll_run_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  run_id      uuid not null references payroll_runs(id) on delete cascade,
  from_status text,
  to_status   text not null,
  actor_id    uuid references users(id) on delete set null,
  note        text not null default '',
  at          timestamptz not null default now(),
  constraint payroll_run_events_from_status_check
    check (from_status in ('draft', 'calculating', 'review', 'approved', 'paid', 'locked', 'cancelled', 'failed')),
  constraint payroll_run_events_to_status_check
    check (to_status in ('draft', 'calculating', 'review', 'approved', 'paid', 'locked', 'cancelled', 'failed'))
);
create index if not exists payroll_run_events_run_idx on payroll_run_events (run_id, at);

-- ── One-offs and advances ───────────────────────────────────────────────────
create table if not exists pay_one_offs (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  employee_id  uuid not null references hrms_employees(id) on delete cascade,
  period       date not null check (extract(day from period) = 1),   -- the month it is paid in
  code         text not null default 'ONE_OFF' check (code ~ '^[A-Z][A-Z0-9_]{0,23}$'),
  name         text not null,
  kind         text not null default 'earning',
  amount_minor bigint not null check (amount_minor > 0),
  taxable      boolean not null default true,
  note         text not null default '',
  status       text not null default 'pending',
  run_id       uuid references payroll_runs(id) on delete set null,   -- set when a run approves it
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint pay_one_offs_kind_check check (kind in ('earning', 'deduction')),
  constraint pay_one_offs_status_check check (status in ('pending', 'applied', 'void'))
);
create index if not exists pay_one_offs_period_idx on pay_one_offs (period, status);

create table if not exists pay_advances (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  employee_id       uuid not null references hrms_employees(id) on delete cascade,
  principal_minor   bigint not null check (principal_minor > 0),
  installment_minor bigint not null check (installment_minor > 0),
  start_period      date not null check (extract(day from start_period) = 1),
  status            text not null default 'active',
  note              text not null default '',
  created_by        uuid references users(id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint pay_advances_status_check check (status in ('active', 'closed', 'void'))
);

-- ── Grants and RLS (0032: nothing is granted by default) ────────────────────
grant select, insert, update         on pay_components      to app_user;
grant select, insert, update         on pay_structures      to app_user;
grant select, insert, delete         on pay_structure_lines to app_user;   -- a structure's lines are replaced
grant select, insert, update         on payroll_runs        to app_user;   -- never deleted
grant select, insert, delete         on payslips            to app_user;   -- rebuilt while calculating
grant select, insert, delete         on payslip_lines       to app_user;
grant select, insert                 on payroll_run_events  to app_user;   -- append-only
grant select, insert, update         on pay_one_offs        to app_user;
grant select, insert, update         on pay_advances        to app_user;

do $$
declare t text;
begin
  foreach t in array array['pay_components','pay_structures','pay_structure_lines','payroll_runs','payslips',
                           'payslip_lines','payroll_run_events','pay_one_offs','pay_advances']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end $$;

-- ── The run state machine, enforced in the database (D-40, gate M6) ────────
create or replace function payroll_run_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() = 1 and old.status in ('approved', 'paid', 'locked') then
      raise exception 'payroll run % is %: it can not be deleted', old.id, old.status;
    end if;
    return old;
  end if;
  if old.status in ('locked', 'cancelled') then
    raise exception 'payroll run % is %: it never changes again', old.id, old.status;
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'draft'       and new.status in ('calculating', 'cancelled'))
    or (old.status = 'calculating' and new.status in ('review', 'failed', 'cancelled'))
    or (old.status = 'failed'      and new.status in ('calculating', 'cancelled'))
    or (old.status = 'review'      and new.status in ('calculating', 'approved', 'cancelled'))
    or (old.status = 'approved'    and new.status in ('review', 'paid', 'cancelled'))
    or (old.status = 'paid'        and new.status = 'locked')) then
    raise exception 'payroll run % can not go from % to %', old.id, old.status, new.status;
  end if;
  -- What was approved is what gets paid: period and scope are fixed from approval.
  if old.status in ('approved', 'paid') and (new.period_start, new.period_end, new.pay_date, new.kind,
       new.employee_ids, new.totals) is distinct from (old.period_start, old.period_end, old.pay_date,
       old.kind, old.employee_ids, old.totals) then
    raise exception 'payroll run % is %: its figures are frozen', old.id, old.status;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists payroll_run_guard on payroll_runs;
create trigger payroll_run_guard before update or delete on payroll_runs
  for each row execute function payroll_run_guard();

-- Payslips and their lines change only while their run is calculating.
create or replace function payslip_freeze() returns trigger
language plpgsql as $$
declare
  st text;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;    -- a cascade (tenant removed, or the payslip being rebuilt)
  end if;
  select status into st from payroll_runs where id = coalesce(new.run_id, old.run_id);
  if st is distinct from 'calculating' then
    raise exception 'payslips of a % payroll run are frozen: corrections go through an adjustment run',
      coalesce(st, 'missing');
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists payslips_freeze on payslips;
create trigger payslips_freeze before insert or update or delete on payslips
  for each row execute function payslip_freeze();
drop trigger if exists payslip_lines_freeze on payslip_lines;
create trigger payslip_lines_freeze before insert or update or delete on payslip_lines
  for each row execute function payslip_freeze();

create trigger audit after insert or update or delete on payroll_runs for each row
  execute function audit_row('number', 'kind', 'purpose', 'period_start', 'period_end', 'pay_date', 'status',
                             'approved_by', 'approved_at', 'paid_at', 'locked_at', 'cancel_reason');
create trigger audit after insert or update or delete on pay_one_offs for each row
  execute function audit_row('employee_id', 'period', 'code', 'kind', 'amount_minor', 'taxable', 'status', 'run_id');
create trigger audit after insert or update or delete on pay_advances for each row
  execute function audit_row('employee_id', 'principal_minor', 'installment_minor', 'start_period', 'status');
create trigger audit after insert or update or delete on pay_components for each row
  execute function audit_row('code', 'name', 'kind', 'calc', 'amount_minor', 'percent', 'percent_of', 'formula',
                             'taxable', 'prorate', 'active');

-- ── The calculate job (app/jobs.py HANDLERS) ────────────────────────────────
insert into scheduled_jobs (code, description, run_every, timeout_s, max_failures, priority) values
  ('payroll.calculate', 'Calculate payroll runs in batches of 100', interval '1 minute', 900, 10, 2)
on conflict (code) do nothing;
