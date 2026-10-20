-- ============================================================================
-- Migration 0045 — Shifts and the punch log (D-43, St03 §6.3, checklist 2I)
--
-- Attendance becomes evidence plus a derivation:
--
--  * hrms_punches — every check-in and check-out ever made, append-only
--    (app_user may SELECT and INSERT, nothing else). A second check-out no
--    longer overwrites the first; a break is two pairs, not lost data.
--  * hrms_shifts — start/end in the tenant's local time, late and early grace,
--    and the worked-minute thresholds below which a day is a half day or an
--    absence. `overnight` is derived from the times (end at or before start).
--  * hrms_shift_assignments — employee ↔ shift with effective dates. No
--    assignment means the tenant default: late after tenants.late_after.
--  * hrms_attendance stays the one row per employee per work day, now derived
--    from the punches (app/attendance.py) and carrying late_min, early_min,
--    worked_min, the shift it was judged against, and `locked` for the payroll
--    run that will freeze it (Phase 3). Kept rather than replaced: payroll,
--    the week matrix, the dashboard, /me and the AI view all read it, and its
--    unique (employee_id, work_date) is exactly the derived day's key.
--
-- Backfill (checklist §7.6): each existing attendance row becomes an `in`
-- punch and, if it has one, an `out` punch, with method, lat/lng and the fraud
-- flag carried over. Idempotent — `backfill_of` + kind is unique, so running
-- hrms_backfill_punches() again adds nothing. Legacy statuses are NOT rewritten
-- (payroll on existing data must not move); only the new minute columns are
-- filled in.
-- ============================================================================

-- ── Shifts ──────────────────────────────────────────────────────────────────
create table if not exists hrms_shifts (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  name               text not null,
  -- Local wall-clock times in the tenant's timezone. Defaults are a plain
  -- 09:00–18:00 day so a shift can be created with just a name.
  start_time         time not null default '09:00',
  end_time           time not null default '18:00',
  grace_in_min       int  not null default 15 check (grace_in_min between 0 and 240),
  grace_out_min      int  not null default 10 check (grace_out_min between 0 and 240),
  -- A checked-out day with fewer worked minutes than these is a half day /
  -- an absence. 0 switches the rule off.
  half_day_below_min int  not null default 240 check (half_day_below_min between 0 and 1440),
  absent_below_min   int  not null default 120 check (absent_below_min between 0 and 1440),
  overnight          boolean generated always as (end_time <= start_time) stored,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (tenant_id, name),
  check (end_time <> start_time),
  check (absent_below_min <= half_day_below_min)
);

create table if not exists hrms_shift_assignments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  employee_id uuid not null references hrms_employees(id) on delete cascade,
  shift_id    uuid not null references hrms_shifts(id),
  date_from   date not null,
  date_to     date,                                   -- null = open-ended
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (date_to is null or date_to >= date_from)
);
create index if not exists hrms_shift_asg_emp_idx on hrms_shift_assignments(employee_id, date_from desc);

-- ── Punches (the evidence) ──────────────────────────────────────────────────
create table if not exists hrms_punches (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  employee_id uuid not null references hrms_employees(id) on delete cascade,
  at          timestamptz not null,
  kind        text not null,                          -- in | out
  -- The work day this punch counts towards, resolved once at punch time from
  -- the shift (an overnight shift's 02:00 check-out belongs to yesterday).
  work_date   date not null,
  method      text not null default 'web',
  lat         double precision,
  lng         double precision,
  fraud_flag  text not null default '',
  backfill_of uuid,                                   -- the hrms_attendance row it came from
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists hrms_punches_day_idx on hrms_punches(employee_id, work_date, at);
create unique index if not exists hrms_punches_backfill_uq on hrms_punches(backfill_of, kind)
  where backfill_of is not null;

-- ── The derived day ─────────────────────────────────────────────────────────
alter table hrms_attendance
  add column if not exists shift_id   uuid references hrms_shifts(id),
  add column if not exists late_min   int not null default 0,
  add column if not exists early_min  int not null default 0,
  add column if not exists worked_min int not null default 0,
  -- Set by a confirmed payroll run (Phase 3); a locked day is never re-derived.
  add column if not exists locked     boolean not null default false;

-- ── Grants and RLS (0032: nothing is granted by default) ────────────────────
grant select, insert         on hrms_shifts            to app_user;
grant select, insert, update on hrms_shift_assignments to app_user;   -- an open assignment is closed by the next
grant select, insert         on hrms_punches           to app_user;   -- append-only

do $$
declare t text;
begin
  foreach t in array array['hrms_shifts','hrms_shift_assignments','hrms_punches']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

-- ── Enum checks (same helper and naming as 0042) ────────────────────────────
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
  execute format('alter table %I add constraint %I check (%s) not valid', tbl, cname, expr);
  begin
    execute format('alter table %I validate constraint %I', tbl, cname);
  exception when check_violation then
    raise notice '% left NOT VALID: existing rows hold values outside %', cname, vals;
  end;
end
$$;

select pg_temp.enum_check('hrms_attendance', 'status',     array['present','late','half_day','absent','leave']);
select pg_temp.enum_check('hrms_punches',    'kind',       array['in','out']);
select pg_temp.enum_check('hrms_punches',    'method',     array['web','mobile','biometric','qr','self']);
select pg_temp.enum_check('hrms_punches',    'fraud_flag', array['','mock_gps','vpn','face_mismatch']);

-- ── Backfill (§7.6) ─────────────────────────────────────────────────────────
-- A function so it can be re-run (and tested) after the migration: it only
-- ever adds the punches a row is missing. Owner-only — app_user never calls it.
create or replace function hrms_backfill_punches() returns int
  language sql as
$$
  with ins as (
    insert into hrms_punches (tenant_id, employee_id, at, kind, work_date, method, lat, lng,
                              fraud_flag, backfill_of, created_at)
    select a.tenant_id, a.employee_id, p.at, p.kind, a.work_date, a.method, a.lat, a.lng,
           a.fraud_flag, a.id, a.created_at
      from hrms_attendance a
     cross join lateral (values ('in', a.check_in), ('out', a.check_out)) as p(kind, at)
     where p.at is not null
    on conflict (backfill_of, kind) where backfill_of is not null do nothing
    returning 1
  )
  select count(*)::int from ins
$$;
revoke execute on function hrms_backfill_punches() from public;

select hrms_backfill_punches();

-- The minute columns for existing rows. Statuses stay as written: a legacy
-- 'late' was judged against late_after, so late_min is measured from it, in
-- the tenant's own timezone (D-11).
update hrms_attendance a
   set worked_min = case when a.check_out > a.check_in
                         then floor(extract(epoch from a.check_out - a.check_in) / 60)::int else 0 end,
       late_min   = case when a.status = 'late' and a.check_in is not null
                         then greatest(0, ceil(extract(epoch from
                                (a.check_in at time zone t.timezone)::time - t.late_after) / 60))::int
                         else 0 end
  from tenants t
 where t.id = a.tenant_id and a.shift_id is null and a.worked_min = 0 and a.late_min = 0;
