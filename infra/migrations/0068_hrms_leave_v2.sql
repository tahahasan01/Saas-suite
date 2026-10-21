-- ============================================================================
-- Migration 0068 — Leave v2: types, the append-only ledger, half-days and
-- the manager → HR approval chain (checklist 3F, D-44, §7.11, St03 §6.4)
--
--  * hrms_leave_types — per tenant, seeded from Pakistani defaults as
--    editable templates (annual, casual, sick, unpaid, maternity, WFH). The
--    numbers are common practice, not legal advice: each carries a "verify"
--    note, and the tenant edits them. Policy lives on the type (grant mode,
--    days per year, cycle start month, carry-forward cap and expiry, max
--    balance, negative allowance, approval route).
--  * hrms_leave_ledger — append-only (app_user: SELECT, INSERT). Balance is
--    sum(days) per employee, type and cycle; nothing else stores one. Unique
--    keys make the grant/accrual/carry job and approvals idempotent.
--  * hrms_leave_requests gain leave_type_id, from_half / to_half ('am'|'pm'),
--    duration_days (frozen at submission, re-checked at approval),
--    approval_step ('manager' | 'hr' | 'done') and cancellation. Status adds
--    'cancelled'. leave_type stays as the type's code for older readers; its
--    fixed-list check goes (codes are the tenant's now — the FK is the rule).
--  * hrms_leave_approvals — who decided which step (append-only).
--
-- Backfill (§7.11), hrms_backfill_leave_v2(), re-runnable: types seeded per
-- tenant with the 0021 quotas; requests linked to their type; durations and
-- steps filled; per employee and balance type a `grant` of the quota for the
-- current calendar-year cycle and a `taken` per approved request, counted
-- exactly as the old derived balance did (working days in the year, weekly
-- off and holidays excluded), so ledger balance = old balance.
-- ============================================================================

create table if not exists hrms_leave_types (
  id                         uuid primary key default gen_random_uuid(),
  tenant_id                  uuid not null references tenants(id) on delete cascade,
  code                       text not null check (code ~ '^[a-z][a-z0-9_]{0,29}$'),
  name                       text not null check (length(btrim(name)) between 1 and 80),
  color                      text not null default '#0f766e' check (color ~ '^#[0-9a-fA-F]{6}$'),
  paid                       boolean not null default true,
  requires_balance           boolean not null default true,
  counts_as                  text not null default 'leave',
  allow_half_day             boolean not null default true,
  approval                   text not null default 'manager_then_hr',
  grant_mode                 text not null default 'annual_upfront',
  days_per_year              numeric(6,2) not null default 0 check (days_per_year between 0 and 366),
  accrual_start_after_days   int not null default 0 check (accrual_start_after_days between 0 and 3650),
  prorate_joiners            boolean not null default true,
  cycle_start_month          int not null default 1 check (cycle_start_month between 1 and 12),
  carry_forward              text not null default 'none',
  carry_cap_days             numeric(6,2) not null default 0 check (carry_cap_days between 0 and 366),
  carry_expires_after_months int check (carry_expires_after_months between 1 and 12),
  max_balance_days           numeric(6,2) check (max_balance_days between 0 and 999),
  allow_negative_days        numeric(6,2) not null default 0 check (allow_negative_days between 0 and 366),
  max_consecutive_days       int check (max_consecutive_days between 1 and 366),
  include_holidays           boolean not null default false,   -- the "sandwich" rule
  statutory_note             text not null default '',
  active                     boolean not null default true,
  sort                       int not null default 100,
  created_at                 timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists hrms_leave_ledger (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  employee_id    uuid not null references hrms_employees(id) on delete cascade,
  leave_type_id  uuid not null references hrms_leave_types(id) on delete cascade,
  cycle_start    date not null,
  entry          text not null,
  days           numeric(6,2) not null,
  period_key     text,
  ref_request_id uuid references hrms_leave_requests(id) on delete set null,
  note           text not null default '',
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists hrms_leave_ledger_bal_idx
  on hrms_leave_ledger (employee_id, leave_type_id, cycle_start);
create unique index if not exists hrms_leave_ledger_idem
  on hrms_leave_ledger (tenant_id, employee_id, leave_type_id, entry, period_key)
  where entry in ('grant', 'accrual', 'carry_in', 'carry_expire');
create unique index if not exists hrms_leave_ledger_req
  on hrms_leave_ledger (tenant_id, ref_request_id, entry, cycle_start)
  where ref_request_id is not null;

alter table hrms_leave_requests
  add column if not exists leave_type_id uuid references hrms_leave_types(id),
  add column if not exists from_half     text,
  add column if not exists to_half       text,
  add column if not exists duration_days numeric(6,2),
  add column if not exists approval_step text,
  add column if not exists requested_by  uuid references users(id) on delete set null,
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancelled_by  uuid references users(id) on delete set null;

create table if not exists hrms_leave_approvals (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  request_id       uuid not null references hrms_leave_requests(id) on delete cascade,
  step             text not null,
  approver_user_id uuid references users(id) on delete set null,
  decision         text not null,
  note             text not null default '',
  decided_at       timestamptz not null default now()
);
create index if not exists hrms_leave_approvals_req_idx on hrms_leave_approvals (request_id);

-- ── Grants and RLS ──────────────────────────────────────────────────────────
grant select, insert, update on hrms_leave_types     to app_user;
grant select, insert         on hrms_leave_ledger    to app_user;   -- append-only
grant select, insert         on hrms_leave_approvals to app_user;   -- append-only

do $$
declare t text;
begin
  foreach t in array array['hrms_leave_types','hrms_leave_ledger','hrms_leave_approvals']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

-- ── Enum checks ─────────────────────────────────────────────────────────────
create or replace function pg_temp.enum_check(tbl text, col text, vals text[], nullable boolean default false)
returns void language plpgsql as
$$
declare
  cname text := tbl || '_' || col || '_check';
  expr  text := format('%I in (%s)', col,
                       (select string_agg(quote_literal(v), ', ') from unnest(vals) v));
begin
  execute format('alter table %I drop constraint if exists %I', tbl, cname);
  if nullable then
    expr := format('%I is null or ', col) || expr;
  end if;
  execute format('alter table %I add constraint %I check (%s)', tbl, cname, expr);
end
$$;

select pg_temp.enum_check('hrms_leave_types', 'counts_as',     array['leave','wfh']);
select pg_temp.enum_check('hrms_leave_types', 'approval',      array['none','manager','hr','manager_then_hr']);
select pg_temp.enum_check('hrms_leave_types', 'grant_mode',    array['annual_upfront','monthly_accrual','none']);
select pg_temp.enum_check('hrms_leave_types', 'carry_forward', array['none','all','capped']);
select pg_temp.enum_check('hrms_leave_ledger', 'entry',
                          array['grant','accrual','carry_in','carry_expire','taken','reversal','adjust']);
select pg_temp.enum_check('hrms_leave_requests', 'from_half',     array['am','pm'], true);
select pg_temp.enum_check('hrms_leave_requests', 'to_half',       array['am','pm'], true);
select pg_temp.enum_check('hrms_leave_requests', 'approval_step', array['manager','hr','done'], true);
select pg_temp.enum_check('hrms_leave_requests', 'status',        array['pending','approved','rejected','cancelled']);
select pg_temp.enum_check('hrms_leave_approvals', 'step',         array['manager','hr']);
select pg_temp.enum_check('hrms_leave_approvals', 'decision',     array['approved','rejected']);
-- Codes are the tenant's now; the FK to hrms_leave_types is the rule.
alter table hrms_leave_requests drop constraint if exists hrms_leave_requests_leave_type_check;

-- ── Audit ───────────────────────────────────────────────────────────────────
create trigger audit after insert or update or delete on hrms_leave_types for each row
  execute function audit_row('code','name','paid','requires_balance','counts_as','approval','grant_mode',
                             'days_per_year','cycle_start_month','carry_forward','carry_cap_days',
                             'carry_expires_after_months','allow_negative_days','active');
create trigger audit after insert on hrms_leave_ledger for each row
  execute function audit_row('employee_id','leave_type_id','cycle_start','entry','days','ref_request_id','note');

-- ── Templates (Pakistani defaults — editable; verify before relying on them) ─
-- Security invoker: as app_user RLS confines it to the caller's tenant (the
-- API seeds lazily); as the migration owner it seeds every tenant. The 0021
-- quotas, where a tenant set them, win over the defaults.
create or replace function hrms_seed_leave_types(p_tenant uuid) returns int
  language plpgsql as
$$
declare n int;
        q_annual int := 14; q_sick int := 10; q_casual int := 10;
begin
  select coalesce(annual_days, 14), coalesce(sick_days, 10), coalesce(casual_days, 10)
    into q_annual, q_sick, q_casual
    from hrms_leave_policies where tenant_id = p_tenant;
  q_annual := coalesce(q_annual, 14); q_sick := coalesce(q_sick, 10); q_casual := coalesce(q_casual, 10);
  insert into hrms_leave_types (tenant_id, code, name, color, paid, requires_balance, counts_as, allow_half_day,
                                approval, grant_mode, days_per_year, cycle_start_month, carry_forward,
                                carry_cap_days, max_consecutive_days, statutory_note, sort)
  values
    (p_tenant, 'annual', 'Annual leave', '#0f766e', true, true, 'leave', true, 'manager_then_hr',
     'annual_upfront', q_annual, 1, 'capped', 14, null,
     'Common practice: 14 days a year after 12 months'' service, some carried forward (Shops and Establishments ordinances). Verify for your province.', 10),
    (p_tenant, 'casual', 'Casual leave', '#2563eb', true, true, 'leave', true, 'manager_then_hr',
     'annual_upfront', q_casual, 1, 'none', 0, null,
     'Common practice: about 10 days a year, a few at a time, not carried forward. Verify.', 20),
    (p_tenant, 'sick', 'Sick leave', '#dc2626', true, true, 'leave', true, 'manager_then_hr',
     'annual_upfront', q_sick, 1, 'none', 0, null,
     'Common practice: 8 to 16 days a year, some laws on half pay; a medical certificate for longer absences. Verify.', 30),
    (p_tenant, 'unpaid', 'Unpaid leave', '#64748b', false, false, 'leave', true, 'manager_then_hr',
     'none', 0, 1, 'none', 0, null, 'No balance; deducted from pay.', 40),
    (p_tenant, 'maternity', 'Maternity leave', '#db2777', true, false, 'leave', false, 'hr',
     'none', 0, 1, 'none', 0, 112,
     'Federal law: 12 weeks; Sindh and Punjab laws give longer (around 16 weeks). Verify for your province.', 50),
    (p_tenant, 'wfh', 'Work from home', '#7c3aed', true, false, 'wfh', true, 'manager',
     'none', 0, 1, 'none', 0, null, 'Worked time, never deducted.', 60)
  on conflict (tenant_id, code) do nothing;
  get diagnostics n = row_count;
  return n;
end
$$;
revoke execute on function hrms_seed_leave_types(uuid) from public;
grant execute on function hrms_seed_leave_types(uuid) to app_user;

-- ── Backfill (§7.11) — owner only, re-runnable ──────────────────────────────
create or replace function hrms_backfill_leave_v2() returns void
  language plpgsql as
$$
declare t record;
begin
  for t in select id from tenants loop
    perform hrms_seed_leave_types(t.id);
  end loop;

  update hrms_leave_requests r set leave_type_id = lt.id
    from hrms_leave_types lt
   where r.leave_type_id is null and lt.tenant_id = r.tenant_id
     and lt.code = case when r.request_type = 'wfh' then 'wfh' else r.leave_type end;
  update hrms_leave_requests set leave_type = 'wfh' where request_type = 'wfh' and leave_type <> 'wfh';

  update hrms_leave_requests r set duration_days = (
      select count(*) from generate_series(r.from_date, r.to_date, interval '1 day') d, tenants tn
       where tn.id = r.tenant_id
         and not (extract(dow from d)::int = any(tn.weekly_off_days))
         and not exists (select 1 from hrms_employee_holidays(r.employee_id, r.from_date, r.to_date) h
                          where h.holiday_date = d::date))
   where r.duration_days is null;
  update hrms_leave_requests set approval_step = case when status = 'pending' then 'hr' else 'done' end
   where approval_step is null;

  -- Opening grant: the 0021 quota for this calendar-year cycle.
  insert into hrms_leave_ledger (tenant_id, employee_id, leave_type_id, cycle_start, entry, days, period_key, note)
  select e.tenant_id, e.id, lt.id, make_date(extract(year from tenant_today(tn.timezone))::int, 1, 1),
         'grant', lt.days_per_year,
         'cycle:' || make_date(extract(year from tenant_today(tn.timezone))::int, 1, 1), 'Opening balance (migration)'
    from hrms_employees e
    join tenants tn on tn.id = e.tenant_id
    join hrms_leave_types lt on lt.tenant_id = e.tenant_id and lt.requires_balance and lt.grant_mode <> 'none'
   where e.status = 'active'
  on conflict do nothing;

  -- Approved requests in this cycle, counted as the old balance counted them.
  insert into hrms_leave_ledger (tenant_id, employee_id, leave_type_id, cycle_start, entry, days, ref_request_id, note)
  select r.tenant_id, r.employee_id, r.leave_type_id, y.start, 'taken', -wd.n, r.id, 'Approved before the ledger (migration)'
    from hrms_leave_requests r
    join tenants tn on tn.id = r.tenant_id
    join hrms_leave_types lt on lt.id = r.leave_type_id and lt.requires_balance
    cross join lateral (select make_date(extract(year from tenant_today(tn.timezone))::int, 1, 1) as start) y
    cross join lateral (
      select count(*) as n from generate_series(greatest(r.from_date, y.start),
                                                least(r.to_date, (y.start + interval '1 year - 1 day')::date),
                                                interval '1 day') d
       where not (extract(dow from d)::int = any(tn.weekly_off_days))
         and not exists (select 1 from hrms_holidays h where h.tenant_id = r.tenant_id and h.holiday_date = d::date)
    ) wd
   where r.status = 'approved' and r.request_type = 'leave' and wd.n > 0
     and r.from_date <= (y.start + interval '1 year - 1 day')::date and r.to_date >= y.start
  on conflict do nothing;
end
$$;
revoke execute on function hrms_backfill_leave_v2() from public;

select hrms_backfill_leave_v2();

-- ── The worker job (app/jobs.py HANDLERS) ───────────────────────────────────
insert into scheduled_jobs (code, description, run_every, timeout_s, max_failures, priority) values
  ('hrms.leave_entitlements', 'Grant, accrue, carry forward and expire leave', interval '1 day', 900, 5, 7)
on conflict (code) do nothing;
