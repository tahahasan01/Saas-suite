-- ============================================================================
-- Migration 0067 — Holiday calendars per province and blackout days
-- (checklist 3F, D-44, St03 §6.4, P3)
--
--  * hrms_holiday_calendars — scope 'federal' (one per tenant, created here
--    for every existing tenant and lazily for new ones), 'province' (with a
--    province code; applies to staff whose work location is in it) or
--    'company'. The federal list is imported from a CSV each year; nothing
--    is hard-coded (Eid and Muharram move with the moon sighting).
--  * hrms_holidays gains calendar_id (existing rows move into the tenant's
--    federal calendar), kind ('public' | 'optional' | 'company') and
--    half_day. One date per calendar instead of one per tenant.
--  * hrms_blackout_days — date ranges when leave can't be requested (an Eid
--    sale week), optionally for one location or department.
--  * hrms_employee_holidays(employee, from, to) — the holidays that apply to
--    one employee: federal + company + their location's province; optional
--    days excluded. Leave duration uses it; payroll and the week matrix
--    should move to it from the tenant-wide hrms_holidays scan.
-- ============================================================================

create table if not exists hrms_holiday_calendars (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 80),
  scope      text not null default 'company',
  province   text,
  created_at timestamptz not null default now(),
  check ((scope = 'province') = (province is not null))
);
create unique index if not exists hrms_holiday_calendars_name_uq
  on hrms_holiday_calendars (tenant_id, lower(btrim(name)));
create unique index if not exists hrms_holiday_calendars_federal_uq
  on hrms_holiday_calendars (tenant_id) where scope = 'federal';

alter table hrms_holidays
  add column if not exists calendar_id uuid references hrms_holiday_calendars(id) on delete cascade,
  add column if not exists kind        text not null default 'public',
  add column if not exists half_day    boolean not null default false;

-- Every tenant gets its federal calendar; existing holidays move into it.
insert into hrms_holiday_calendars (tenant_id, name, scope)
select id, 'Federal', 'federal' from tenants
on conflict do nothing;
update hrms_holidays h set calendar_id = c.id
  from hrms_holiday_calendars c
 where h.calendar_id is null and c.tenant_id = h.tenant_id and c.scope = 'federal';
alter table hrms_holidays alter column calendar_id set not null;

alter table hrms_holidays drop constraint if exists hrms_holidays_tenant_id_holiday_date_key;
create unique index if not exists hrms_holidays_calendar_date_uq on hrms_holidays (calendar_id, holiday_date);

create table if not exists hrms_blackout_days (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 120),
  date_from     date not null,
  date_to       date not null,
  location_id   uuid references hrms_locations(id) on delete cascade,
  department_id uuid references hrms_departments(id) on delete cascade,
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (date_to >= date_from)
);
create index if not exists hrms_blackout_tenant_idx on hrms_blackout_days (tenant_id, date_from);

-- ── Grants and RLS ──────────────────────────────────────────────────────────
grant select, insert, update, delete on hrms_holiday_calendars to app_user;   -- a calendar is removed with its days
grant select, insert, delete         on hrms_blackout_days     to app_user;

do $$
declare t text;
begin
  foreach t in array array['hrms_holiday_calendars','hrms_blackout_days']
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

select pg_temp.enum_check('hrms_holiday_calendars', 'scope',    array['federal','province','company']);
select pg_temp.enum_check('hrms_holiday_calendars', 'province', array['PB','SD','KP','BA','ICT','GB','AJK'], true);
select pg_temp.enum_check('hrms_holidays',          'kind',     array['public','optional','company']);

-- ── Which holidays apply to one employee ────────────────────────────────────
create or replace function hrms_employee_holidays(p_employee uuid, p_from date, p_to date)
returns table (holiday_date date, name text, half_day boolean, kind text)
language sql stable as
$$
  select distinct on (h.holiday_date) h.holiday_date, h.name, h.half_day, h.kind
    from hrms_employees e
    join hrms_holiday_calendars c on c.tenant_id = e.tenant_id
    left join hrms_locations l on l.id = e.location_id
    join hrms_holidays h on h.calendar_id = c.id
   where e.id = p_employee
     and h.holiday_date between p_from and p_to
     and h.kind <> 'optional'
     and (c.scope in ('federal', 'company') or (c.scope = 'province' and c.province = l.province))
   order by h.holiday_date, h.half_day, c.scope
$$;
revoke execute on function hrms_employee_holidays(uuid, date, date) from public;
grant execute on function hrms_employee_holidays(uuid, date, date) to app_user;
