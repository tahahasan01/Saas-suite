-- ============================================================================
-- Migration 0037 — Tenant settings, finished (D-11, audit P1-2, St03 risk 5)
--
-- 0029 gave every tenant a timezone and a late threshold (late_after), and
-- 0031 the cash rounding step. This completes the typed settings:
--
--  * fy_start_month — the month the tenant's financial year starts. Pakistan's
--    fiscal and tax year runs July–June, so the default is 7.
--  * timezone is checked against the server's IANA list. db.tenant_conn sets
--    the session TimeZone from it on every transaction, so a typo would fail
--    every request the tenant makes rather than one settings save.
--  * tenant_today(tz) — the local date for a zone, for code that runs outside
--    a tenant transaction (jobs, owner connections) and so has no session
--    TimeZone to lean on.
--  * hrms_attendance.work_date loses its `default current_date`: the work day
--    is the punch's local date, written explicitly by the check-in, never
--    whatever clock the inserting session happens to have.
-- ============================================================================

create or replace function is_timezone(tz text) returns boolean
  language sql stable as
$$ select exists (select 1 from pg_timezone_names where name = tz) $$;

create or replace function tenant_today(tz text) returns date
  language sql stable as
$$ select (now() at time zone tz)::date $$;

grant execute on function is_timezone(text), tenant_today(text) to app_user;

alter table tenants
  add column if not exists fy_start_month smallint not null default 7
    check (fy_start_month between 1 and 12);

alter table tenants drop constraint if exists tenants_timezone_check;
alter table tenants add constraint tenants_timezone_check check (is_timezone(timezone));

alter table hrms_attendance alter column work_date drop default;
