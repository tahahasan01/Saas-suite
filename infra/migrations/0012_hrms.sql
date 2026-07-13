-- ============================================================================
-- Migration 0012 — HRMS: employees, attendance, leave
-- Web-first. Mobile selfie face-match + biometric hardware come later; the
-- attendance rows already carry method + geo + a fraud flag for that.
-- ============================================================================

create table if not exists hrms_employees (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  user_id      uuid references users(id) on delete set null,  -- optional login link
  name         text not null,
  email        text not null default '',
  phone        text not null default '',
  cnic         text not null default '',
  designation  text not null default '',
  department   text not null default '',
  join_date    date,
  salary_minor bigint not null default 0,
  status       text not null default 'active',   -- active | inactive
  created_at   timestamptz not null default now()
);
create index if not exists hrms_emp_tenant_idx on hrms_employees(tenant_id) where status = 'active';

create table if not exists hrms_attendance (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  employee_id uuid not null references hrms_employees(id) on delete cascade,
  work_date   date not null default current_date,
  check_in    timestamptz,
  check_out   timestamptz,
  status      text not null default 'present',   -- present | late | absent | leave
  method      text not null default 'web',        -- web | mobile | biometric | qr
  lat         double precision,
  lng         double precision,
  fraud_flag  text not null default '',           -- '' | mock_gps | vpn | face_mismatch
  created_at  timestamptz not null default now(),
  unique (employee_id, work_date)
);
create index if not exists hrms_att_tenant_date_idx on hrms_attendance(tenant_id, work_date desc);

create table if not exists hrms_leave_requests (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  employee_id uuid not null references hrms_employees(id) on delete cascade,
  leave_type  text not null default 'annual',     -- annual | sick | casual | unpaid
  from_date   date not null,
  to_date     date not null,
  reason      text not null default '',
  status      text not null default 'pending',     -- pending | approved | rejected
  decided_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists hrms_leave_tenant_idx on hrms_leave_requests(tenant_id, status, created_at desc);
create index if not exists hrms_leave_emp_idx on hrms_leave_requests(employee_id);

grant select, insert, update, delete on hrms_employees, hrms_attendance, hrms_leave_requests to app_user;
do $$
declare t text;
begin
  foreach t in array array['hrms_employees','hrms_attendance','hrms_leave_requests']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;
