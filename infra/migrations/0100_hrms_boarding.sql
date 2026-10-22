-- ============================================================================
-- Migration 0100 — Onboarding and offboarding checklists (wave C, H23/H24, St12)
--
--  * hrms_employees.exit_date / exit_reason — leaving is a date. Offboarding
--    sets it (the last working day); cancelling it clears it. Payroll pays a
--    leaver up to it.
--  * hrms_boarding_templates (+ _tasks) — reusable task lists for joining or
--    leaving: who does it (hr, it, manager, employee, admin) and when, in
--    days from the anchor date. A template's tasks are replaced as a whole.
--  * hrms_boardings — one person joining or leaving: the anchor date (joining
--    date or last working day) and, when leaving, the reason, notice date and
--    last working day. One open boarding of each kind per employee.
--  * hrms_boarding_tasks — the template copied and dated; done or skipped
--    (with a note). Completing the boarding needs every task closed.
--  * hrms_exit_interviews — one per offboarding, confidential to HR.
-- ============================================================================

alter table hrms_employees
  add column if not exists exit_date   date,
  add column if not exists exit_reason text;

create table if not exists hrms_boarding_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  kind        text not null,
  name        text not null check (length(btrim(name)) between 1 and 120),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists hrms_boarding_templates_name_uq
  on hrms_boarding_templates (tenant_id, kind, lower(btrim(name)));

create table if not exists hrms_boarding_template_tasks (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  template_id  uuid not null references hrms_boarding_templates(id) on delete cascade,
  title        text not null check (length(btrim(title)) between 1 and 200),
  owner        text not null default 'hr',
  offset_days  int not null default 0 check (offset_days between -365 and 365),
  sort         int not null default 0
);
create index if not exists hrms_boarding_template_tasks_idx on hrms_boarding_template_tasks (template_id, sort);

create table if not exists hrms_boardings (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  employee_id      uuid not null references hrms_employees(id) on delete cascade,
  kind             text not null,
  template_id      uuid references hrms_boarding_templates(id) on delete set null,
  anchor_date      date not null,
  status           text not null default 'open',
  reason           text,
  notice_date      date,
  last_working_day date,
  note             text not null default '' check (length(note) <= 1000),
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  closed_at        timestamptz,
  closed_by        uuid references users(id) on delete set null,
  -- Leaving needs a reason and a last day; joining has neither.
  check ((kind = 'offboarding') = (last_working_day is not null)),
  check ((kind = 'offboarding') = (reason is not null)),
  check (notice_date is null or last_working_day is null or last_working_day >= notice_date)
);
create unique index if not exists hrms_boardings_open_uq
  on hrms_boardings (employee_id, kind) where status = 'open';
create index if not exists hrms_boardings_tenant_idx on hrms_boardings (tenant_id, kind, status);

create table if not exists hrms_boarding_tasks (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  boarding_id  uuid not null references hrms_boardings(id) on delete cascade,
  title        text not null check (length(btrim(title)) between 1 and 200),
  owner        text not null default 'hr',
  due_on       date,
  sort         int not null default 0,
  status       text not null default 'open',
  note         text not null default '' check (length(note) <= 500),
  done_at      timestamptz,
  done_by      uuid references users(id) on delete set null,
  check (status <> 'skipped' or length(btrim(note)) > 0)
);
create index if not exists hrms_boarding_tasks_idx on hrms_boarding_tasks (boarding_id, sort);

create table if not exists hrms_exit_interviews (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  boarding_id     uuid not null unique references hrms_boardings(id) on delete cascade,
  held_on         date,
  outcome         text,
  rating          int check (rating between 1 and 5),
  primary_reason  text,
  would_rejoin    boolean,
  notes           text not null default '' check (length(notes) <= 4000),
  updated_by      uuid references users(id) on delete set null,
  updated_at      timestamptz not null default now()
);

grant select, insert, update         on hrms_boarding_templates      to app_user;   -- retired, never deleted
grant select, insert, delete         on hrms_boarding_template_tasks to app_user;   -- replaced as a whole
grant select, insert, update         on hrms_boardings               to app_user;   -- closed, never deleted
grant select, insert, update         on hrms_boarding_tasks          to app_user;
grant select, insert, update         on hrms_exit_interviews         to app_user;

do $$
declare t text;
begin
  foreach t in array array['hrms_boarding_templates','hrms_boarding_template_tasks','hrms_boardings',
                           'hrms_boarding_tasks','hrms_exit_interviews']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

-- ── Enum checks (0042's helper and naming) ──────────────────────────────────
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

select pg_temp.enum_check('hrms_employees', 'exit_reason',
                          array['resigned','terminated','retired','contract_end','absconded','deceased','other'], true);
select pg_temp.enum_check('hrms_boarding_templates', 'kind', array['onboarding','offboarding']);
select pg_temp.enum_check('hrms_boarding_template_tasks', 'owner', array['hr','it','manager','employee','admin']);
select pg_temp.enum_check('hrms_boardings', 'kind', array['onboarding','offboarding']);
select pg_temp.enum_check('hrms_boardings', 'status', array['open','completed','cancelled']);
select pg_temp.enum_check('hrms_boardings', 'reason',
                          array['resigned','terminated','retired','contract_end','absconded','deceased','other'], true);
select pg_temp.enum_check('hrms_boarding_tasks', 'owner', array['hr','it','manager','employee','admin']);
select pg_temp.enum_check('hrms_boarding_tasks', 'status', array['open','done','skipped']);
select pg_temp.enum_check('hrms_exit_interviews', 'outcome', array['retained','leaving'], true);
select pg_temp.enum_check('hrms_exit_interviews', 'primary_reason',
                          array['pay','growth','manager','workload','hours','relocation','studies','health',
                                'personal','other'], true);

-- ── Audit (the confidential interview is not mirrored field by field) ──────
drop trigger if exists audit_exit on hrms_employees;
create trigger audit_exit after update on hrms_employees for each row
  execute function audit_row('exit_date','exit_reason');
drop trigger if exists audit on hrms_boardings;
create trigger audit after insert or update on hrms_boardings for each row
  execute function audit_row('employee_id','kind','status','reason','notice_date','last_working_day');
drop trigger if exists audit on hrms_boarding_tasks;
create trigger audit after insert or update on hrms_boarding_tasks for each row
  execute function audit_row('boarding_id','title','owner','due_on','status','note');
drop trigger if exists audit on hrms_exit_interviews;
create trigger audit after insert or update on hrms_exit_interviews for each row
  execute function audit_row('boarding_id','held_on','outcome');
