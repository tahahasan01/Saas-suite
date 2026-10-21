-- ============================================================================
-- Migration 0069 — Salary history and payroll identity (D-42, St03 §6.2,
-- checklist 3F and §7.2)
--
-- 1. hrms_compensation: effective-dated salary rows, never edited in place.
--    The row in force on a day is the one with the latest effective_from on
--    or before it (ties: the later insert, `seq`). app_user may SELECT and
--    INSERT only, and a trigger refuses an UPDATE even from the owner.
--
--    hrms_employees.salary_minor stays readable for one release as a MIRROR
--    of today's row (or the joining row of someone who starts later). The
--    legacy writes keep working and become history:
--      * inserting an employee adds its 'joining' row;
--      * changing salary_minor directly adds a 'correction' row from the
--        day the row in force today began (the single salary field always
--        meant "the salary"); a dated raise goes through the API instead.
--    A new compensation row re-mirrors salary_minor. Two GUCs stop the two
--    triggers from feeding each other (app.comp_sync, app.comp_from_employee).
--    Rollback (§7.2): salary_minor is still a real column holding the same
--    value, so code can read it again; delete the 'joining' rows this
--    migration's backfill created.
--
-- 2. Payroll identity on hrms_employees: bank name, IBAN (shape-checked here,
--    mod-97 in app/iban.py), NTN, EOBI and social-security numbers, payment
--    mode, and the per-employee EOBI / social-security applicability override
--    (null = automatic) with the reason (St03 risk 10). Audited by their own
--    trigger with every value guarded.
--
-- Backfill: hrms_backfill_compensation() gives each employee without history
-- one 'joining' row, effective_from = coalesce(join_date, created_at::date).
-- Idempotent.
-- ============================================================================

create table if not exists hrms_compensation (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  employee_id    uuid not null references hrms_employees(id) on delete cascade,
  effective_from date not null,
  base_minor     bigint not null check (base_minor >= 0),   -- monthly gross basis, paisa
  reason         text not null default 'increment',
  note           text not null default '',
  seq            bigint generated always as identity,       -- same-day tie-break: later wins
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint hrms_compensation_reason_check
    check (reason in ('joining', 'increment', 'promotion', 'correction', 'adjustment'))
);
create index if not exists hrms_compensation_emp_idx
  on hrms_compensation (employee_id, effective_from desc, seq desc);

grant select, insert on hrms_compensation to app_user;   -- history: never updated or deleted
alter table hrms_compensation enable row level security;
drop policy if exists tenant_isolation on hrms_compensation;
create policy tenant_isolation on hrms_compensation
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Never edited in place — not even by the owner. (Deletes happen only by
-- cascade, when the employee or tenant goes; app_user holds no DELETE.)
create or replace function hrms_compensation_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'compensation rows are never edited in place: add a new row instead';
end $$;
drop trigger if exists hrms_compensation_no_update on hrms_compensation;
create trigger hrms_compensation_no_update before update on hrms_compensation
  for each row execute function hrms_compensation_immutable();

-- The monthly base in force on a day: today's row, else the earliest row of
-- someone who has not started yet. Runs as the caller, so RLS applies.
create or replace function hrms_base_on(p_employee uuid, p_on date) returns bigint
language sql stable as $$
  select coalesce(
    (select base_minor from hrms_compensation
      where employee_id = p_employee and effective_from <= p_on
      order by effective_from desc, seq desc limit 1),
    (select base_minor from hrms_compensation
      where employee_id = p_employee
      order by effective_from, seq desc limit 1))
$$;

-- A new compensation row re-mirrors salary_minor.
create or replace function hrms_compensation_mirror() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.comp_from_employee', true), '') = 'on' then
    return null;   -- the employee row is already being given this value
  end if;
  perform set_config('app.comp_sync', 'on', true);
  update hrms_employees set salary_minor = coalesce(hrms_base_on(new.employee_id, current_date), 0)
   where id = new.employee_id;
  perform set_config('app.comp_sync', '', true);
  return null;
end $$;
drop trigger if exists hrms_compensation_mirror on hrms_compensation;
create trigger hrms_compensation_mirror after insert on hrms_compensation
  for each row execute function hrms_compensation_mirror();

-- Legacy writes on hrms_employees become history.
create or replace function hrms_employee_salary_history() returns trigger
language plpgsql as $$
declare
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('app.comp_sync', true), '') = 'on' then
    return new;    -- the mirror itself
  end if;
  perform set_config('app.comp_from_employee', 'on', true);
  if tg_op = 'INSERT' then
    insert into hrms_compensation (tenant_id, employee_id, effective_from, base_minor, reason, created_by)
    values (new.tenant_id, new.id, coalesce(new.join_date, new.created_at::date), new.salary_minor,
            'joining', actor);
  else
    -- A direct edit corrects the salary in force today from the day that row
    -- began, as the single salary field always meant; a dated raise is a
    -- new compensation row instead. Locked payslips are stored, so this
    -- can't move them.
    insert into hrms_compensation (tenant_id, employee_id, effective_from, base_minor, reason, created_by)
    values (new.tenant_id, new.id,
            coalesce((select effective_from from hrms_compensation
                       where employee_id = new.id and effective_from <= current_date
                       order by effective_from desc, seq desc limit 1),
                     (select min(effective_from) from hrms_compensation where employee_id = new.id),
                     current_date),
            new.salary_minor, 'correction', actor);
  end if;
  perform set_config('app.comp_from_employee', '', true);
  return new;
end $$;
drop trigger if exists hrms_employee_joining_salary on hrms_employees;
create trigger hrms_employee_joining_salary after insert on hrms_employees
  for each row execute function hrms_employee_salary_history();
drop trigger if exists hrms_employee_salary_edit on hrms_employees;
create trigger hrms_employee_salary_edit before update of salary_minor on hrms_employees
  for each row when (old.salary_minor is distinct from new.salary_minor)
  execute function hrms_employee_salary_history();

-- Backfill (idempotent): one 'joining' row per employee with no history.
create or replace function hrms_backfill_compensation() returns bigint
language plpgsql as $$
declare n bigint;
begin
  perform set_config('app.comp_from_employee', 'on', true);
  insert into hrms_compensation (tenant_id, employee_id, effective_from, base_minor, reason)
  select e.tenant_id, e.id, coalesce(e.join_date, e.created_at::date), e.salary_minor, 'joining'
    from hrms_employees e
   where not exists (select 1 from hrms_compensation c where c.employee_id = e.id);
  get diagnostics n = row_count;
  perform set_config('app.comp_from_employee', '', true);
  return n;
end $$;
select hrms_backfill_compensation();

create trigger audit after insert or update or delete on hrms_compensation for each row
  execute function audit_row('employee_id', 'effective_from', '!base_minor', 'reason', 'note');

-- ── Payroll identity ────────────────────────────────────────────────────────
alter table hrms_employees
  add column if not exists bank_name       text not null default '',
  -- Normalised (no spaces, upper case); the full mod-97 check is app/iban.py.
  add column if not exists iban            text not null default ''
    constraint hrms_employees_iban_shape check (iban = '' or iban ~ '^PK[0-9]{2}[A-Z]{4}[0-9]{16}$'),
  add column if not exists ntn             text not null default '',
  add column if not exists eobi_number     text not null default '',
  add column if not exists ss_number       text not null default '',   -- PESSI / SESSI registration
  add column if not exists payment_mode    text not null default 'cash'
    constraint hrms_employees_payment_mode_check check (payment_mode in ('bank', 'cash', 'cheque')),
  -- null = decided by the rules (registration, province, wage ceiling).
  add column if not exists eobi_applicable boolean,
  add column if not exists ss_applicable   boolean,
  add column if not exists statutory_note  text not null default '';     -- why an override was set

-- Updates only: the fields start blank, are set through the payroll details
-- endpoint, and the main `audit` trigger already records inserts and deletes.
create trigger audit_payroll after update on hrms_employees for each row
  execute function audit_row('bank_name', '!iban', '!ntn', '!eobi_number', '!ss_number', 'payment_mode',
                             'eobi_applicable', 'ss_applicable', 'statutory_note');
