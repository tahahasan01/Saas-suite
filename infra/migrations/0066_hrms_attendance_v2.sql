-- ============================================================================
-- Migration 0066 — Attendance v2: geofence evidence, kiosks, auto check-out,
-- overtime and correction requests (checklist 3F, D-43, St03 §6.3 / P1)
--
--  * hrms_punches gains what the server judged: accuracy, IP, geo_status /
--    ip_status, risk_flags (`mock_gps` is a flag, never a pass), and the
--    location and kiosk it came through. Methods add 'kiosk', 'auto' (the
--    auto check-out job) and 'correction' (an approved correction request).
--  * hrms_shifts gains the auto check-out policy (off | shift_end |
--    max_hours) and when overtime starts. app_user may now UPDATE shifts, for
--    the policy endpoint only.
--  * hrms_attendance gains auto_closed, overtime_min, corrected and the
--    geo/ip status of the day's last check-in. A day closed by the job keeps
--    Phase 2's rule — its open interval counts 0 minutes and it earns no
--    overtime — until an approved correction supplies the real time.
--  * hrms_kiosks — one token per device, stored as sha256 (the raw token is
--    shown once). A kiosk can only punch, for staff of its location, from the
--    location's networks.
--  * hrms_attendance_corrections — requested in/out times with a reason;
--    the employee's manager or an HR approver decides, never the requester.
--    Approval appends `correction` punches; nothing is rewritten.
-- ============================================================================

alter table hrms_punches
  add column if not exists accuracy_m  double precision,
  add column if not exists ip          inet,
  add column if not exists geo_status  text,
  add column if not exists ip_status   text,
  add column if not exists risk_flags  text[] not null default '{}',
  add column if not exists location_id uuid references hrms_locations(id) on delete set null,
  add column if not exists kiosk_id    uuid;

alter table hrms_shifts
  add column if not exists auto_checkout           text not null default 'off',
  add column if not exists auto_checkout_after_min int  not null default 600
    check (auto_checkout_after_min between 30 and 1440),
  add column if not exists overtime_after_min      int  not null default 30
    check (overtime_after_min between 0 and 1440);

alter table hrms_attendance
  add column if not exists auto_closed  boolean not null default false,
  add column if not exists overtime_min int not null default 0,
  add column if not exists corrected    boolean not null default false,
  add column if not exists geo_status   text,
  add column if not exists ip_status    text;

create table if not exists hrms_kiosks (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  location_id  uuid not null references hrms_locations(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 80),
  token_hash   text not null unique,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at   timestamptz
);
create index if not exists hrms_kiosks_location_idx on hrms_kiosks (location_id);
alter table hrms_punches drop constraint if exists hrms_punches_kiosk_id_fkey;
alter table hrms_punches add constraint hrms_punches_kiosk_id_fkey
  foreign key (kiosk_id) references hrms_kiosks(id) on delete set null;

create table if not exists hrms_attendance_corrections (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  employee_id    uuid not null references hrms_employees(id) on delete cascade,
  work_date      date not null,
  requested_in   timestamptz,
  requested_out  timestamptz,
  reason         text not null check (length(btrim(reason)) between 1 and 500),
  status         text not null default 'pending',
  requested_by   uuid references users(id) on delete set null,
  decided_by     uuid references users(id) on delete set null,
  decided_at     timestamptz,
  decision_note  text not null default '',
  created_at     timestamptz not null default now(),
  -- "at least one of in/out" is the API's rule (CorrectionCreate)
  check (requested_in is null or requested_out is null or requested_out > requested_in)
);
create index if not exists hrms_corrections_tenant_idx on hrms_attendance_corrections (tenant_id, status, created_at desc);
create unique index if not exists hrms_corrections_one_pending
  on hrms_attendance_corrections (employee_id, work_date) where status = 'pending';

-- ── Grants and RLS ──────────────────────────────────────────────────────────
grant update                 on hrms_shifts                 to app_user;   -- the policy endpoint
grant select, insert, update on hrms_kiosks                 to app_user;
grant select, insert, update on hrms_attendance_corrections to app_user;

do $$
declare t text;
begin
  foreach t in array array['hrms_kiosks','hrms_attendance_corrections']
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

select pg_temp.enum_check('hrms_punches',    'method', array['web','mobile','biometric','qr','self','kiosk','auto','correction']);
select pg_temp.enum_check('hrms_attendance', 'method', array['web','mobile','biometric','qr','self','kiosk','auto','correction']);
select pg_temp.enum_check('hrms_punches',    'geo_status', array['inside','outside','no_fix','not_required'], true);
select pg_temp.enum_check('hrms_attendance', 'geo_status', array['inside','outside','no_fix','not_required'], true);
select pg_temp.enum_check('hrms_punches',    'ip_status',  array['allowed','outside','not_required'], true);
select pg_temp.enum_check('hrms_attendance', 'ip_status',  array['allowed','outside','not_required'], true);
select pg_temp.enum_check('hrms_shifts',     'auto_checkout', array['off','shift_end','max_hours']);
select pg_temp.enum_check('hrms_attendance_corrections', 'status', array['pending','approved','rejected','cancelled']);

-- ── Audit ───────────────────────────────────────────────────────────────────
create trigger audit after insert or update or delete on hrms_attendance_corrections for each row
  execute function audit_row('employee_id','work_date','requested_in','requested_out','reason',
                             'status','decided_by','decided_at','decision_note');
create trigger audit after insert or update or delete on hrms_kiosks for each row
  execute function audit_row('location_id','name','revoked_at');
create trigger audit after update on hrms_shifts for each row
  execute function audit_row('auto_checkout','auto_checkout_after_min','overtime_after_min');

-- ── The worker job (app/jobs.py HANDLERS) ───────────────────────────────────
insert into scheduled_jobs (code, description, run_every, timeout_s, max_failures, priority) values
  ('hrms.auto_checkout', 'Close attendance days per each shift''s auto check-out rule', interval '15 minutes', 600, 5, 6)
on conflict (code) do nothing;
