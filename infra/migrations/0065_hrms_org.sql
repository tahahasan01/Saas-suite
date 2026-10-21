-- ============================================================================
-- Migration 0065 — HR org structure (checklist 3F, St03 §6.2, §7.10)
--
--  * hrms_departments — a tree (parent_id); the API refuses a cycle.
--  * hrms_job_titles — optionally under a department.
--  * hrms_locations — where people work: a point and radius for the server-
--    side geofence, the networks a punch or kiosk may come from, and the
--    province (PB, SD, KP, BA, ICT, GB, AJK) that picks the holiday calendar
--    and, for payroll, PESSI/SESSI. `province` is a text code checked here;
--    integration adds the FK to pk_regions once that table exists.
--  * hrms_employees gains code, department/job title/location/manager links,
--    employment type and probation end. Bank, IBAN, NTN, EOBI and SS numbers
--    are payroll's (0069+). `kiosk_pin_hash` holds an Argon2 hash (0066 uses it).
--  * hrms_employee_documents — CNIC copies, contracts, certificates, with an
--    expiry date. `file_id` is a plain uuid until the files table exists;
--    integration adds the FK.
--
-- Backfill (§7.10): distinct text departments and designations per tenant,
-- grouped case- and whitespace-insensitively, become rows; employees point at
-- them. The text columns stay (rollback, the AI views, older clients) and the
-- API keeps them in step with the links. hrms_link_org_text() is idempotent
-- and runs again for sample data and for any row still carrying text only.
-- ============================================================================

create table if not exists hrms_departments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  name             text not null check (length(btrim(name)) between 1 and 120),
  parent_id        uuid references hrms_departments(id) on delete set null,
  head_employee_id uuid references hrms_employees(id) on delete set null,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);
create unique index if not exists hrms_departments_name_uq
  on hrms_departments (tenant_id, lower(btrim(name)));

create table if not exists hrms_job_titles (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 120),
  department_id uuid references hrms_departments(id) on delete set null,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index if not exists hrms_job_titles_name_uq
  on hrms_job_titles (tenant_id, lower(btrim(name)));

create table if not exists hrms_locations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 120),
  kind          text not null default 'office',
  address       text not null default '',
  lat           double precision check (lat between -90 and 90),
  lng           double precision check (lng between -180 and 180),
  radius_m      int not null default 150 check (radius_m between 10 and 5000),
  -- Networks a punch (ip_mode) or a kiosk may come from. Empty = no rule.
  allowed_cidrs cidr[] not null default '{}',
  province      text,
  -- off: not checked · record: checked and flagged · require: refused unless inside.
  geo_mode      text not null default 'record',
  ip_mode       text not null default 'off',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  check ((lat is null) = (lng is null)),
  -- A geofence needs a point to measure from.
  check (geo_mode <> 'require' or lat is not null)
);
create unique index if not exists hrms_locations_name_uq
  on hrms_locations (tenant_id, lower(btrim(name)));

alter table hrms_employees
  add column if not exists code            text,
  add column if not exists department_id   uuid references hrms_departments(id) on delete set null,
  add column if not exists job_title_id    uuid references hrms_job_titles(id) on delete set null,
  add column if not exists location_id     uuid references hrms_locations(id) on delete set null,
  add column if not exists manager_id      uuid references hrms_employees(id) on delete set null,
  add column if not exists employment_type text not null default 'permanent',
  add column if not exists probation_end   date,
  add column if not exists kiosk_pin_hash  text;
alter table hrms_employees drop constraint if exists hrms_employees_manager_not_self;
alter table hrms_employees add constraint hrms_employees_manager_not_self
  check (manager_id is null or manager_id <> id);
create unique index if not exists hrms_employees_code_uq
  on hrms_employees (tenant_id, lower(code)) where code is not null and code <> '';
create index if not exists hrms_employees_manager_idx on hrms_employees (manager_id) where manager_id is not null;

create table if not exists hrms_employee_documents (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  employee_id uuid not null references hrms_employees(id) on delete cascade,
  kind        text not null default 'other',
  title       text not null check (length(btrim(title)) between 1 and 160),
  number      text not null default '',
  issued_on   date,
  expires_on  date,
  file_id     uuid,                       -- FK to files added at integration
  note        text not null default '',
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (expires_on is null or issued_on is null or expires_on >= issued_on)
);
create index if not exists hrms_emp_docs_emp_idx on hrms_employee_documents (employee_id);
create index if not exists hrms_emp_docs_expiry_idx on hrms_employee_documents (tenant_id, expires_on)
  where expires_on is not null;

-- ── Grants and RLS (0032: nothing by default) ───────────────────────────────
grant select, insert, update         on hrms_departments, hrms_job_titles, hrms_locations to app_user;
grant select, insert, update, delete on hrms_employee_documents to app_user;   -- a mistaken entry is removed

do $$
declare t text;
begin
  foreach t in array array['hrms_departments','hrms_job_titles','hrms_locations','hrms_employee_documents']
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

select pg_temp.enum_check('hrms_locations', 'kind',     array['office','store','warehouse','factory','remote']);
select pg_temp.enum_check('hrms_locations', 'province', array['PB','SD','KP','BA','ICT','GB','AJK'], true);
select pg_temp.enum_check('hrms_locations', 'geo_mode', array['off','record','require']);
select pg_temp.enum_check('hrms_locations', 'ip_mode',  array['off','record','require']);
select pg_temp.enum_check('hrms_employees', 'employment_type',
                          array['permanent','contract','probation','daily_wage','intern']);
select pg_temp.enum_check('hrms_employee_documents', 'kind',
                          array['cnic','contract','certificate','medical','license','passport','other']);

-- ── Audit: org changes on the employee (a second trigger, update only, so
-- it never doubles the insert row and survives another branch redefining
-- the first). The PIN hash is never stored as a value.
drop trigger if exists audit_org on hrms_employees;
create trigger audit_org after update on hrms_employees for each row
  execute function audit_row('code','department_id','job_title_id','location_id','manager_id',
                             'employment_type','probation_end','email','phone','!kiosk_pin_hash');
create trigger audit after insert or update or delete on hrms_employee_documents for each row
  execute function audit_row('employee_id','kind','title','expires_on','file_id');
create trigger audit after insert or update or delete on hrms_locations for each row
  execute function audit_row('name','lat','lng','radius_m','allowed_cidrs','province','geo_mode','ip_mode','active');

-- ── Backfill (§7.10) ────────────────────────────────────────────────────────
-- Security invoker: as the migration owner it covers every tenant; as
-- app_user (sample data) RLS confines it to the caller's tenant.
create or replace function hrms_link_org_text() returns int
  language plpgsql as
$$
declare n int := 0; rc int;
begin
  -- One department per distinct normalised name, spelled as most staff spell it.
  insert into hrms_departments (tenant_id, name)
  select tenant_id, (array_agg(nm order by cnt desc, nm))[1]
    from (select tenant_id, btrim(regexp_replace(department, '\s+', ' ', 'g')) as nm,
                 lower(btrim(regexp_replace(department, '\s+', ' ', 'g'))) as k, count(*) as cnt
            from hrms_employees where btrim(department) <> ''
           group by 1, 2, 3) s
   group by tenant_id, k
  on conflict (tenant_id, lower(btrim(name))) do nothing;

  insert into hrms_job_titles (tenant_id, name)
  select tenant_id, (array_agg(nm order by cnt desc, nm))[1]
    from (select tenant_id, btrim(regexp_replace(designation, '\s+', ' ', 'g')) as nm,
                 lower(btrim(regexp_replace(designation, '\s+', ' ', 'g'))) as k, count(*) as cnt
            from hrms_employees where btrim(designation) <> ''
           group by 1, 2, 3) s
   group by tenant_id, k
  on conflict (tenant_id, lower(btrim(name))) do nothing;

  update hrms_employees e set department_id = d.id
    from hrms_departments d
   where e.department_id is null and btrim(e.department) <> '' and d.tenant_id = e.tenant_id
     and lower(btrim(d.name)) = lower(btrim(regexp_replace(e.department, '\s+', ' ', 'g')));
  get diagnostics rc = row_count; n := n + rc;

  update hrms_employees e set job_title_id = j.id
    from hrms_job_titles j
   where e.job_title_id is null and btrim(e.designation) <> '' and j.tenant_id = e.tenant_id
     and lower(btrim(j.name)) = lower(btrim(regexp_replace(e.designation, '\s+', ' ', 'g')));
  get diagnostics rc = row_count; n := n + rc;
  return n;
end
$$;
revoke execute on function hrms_link_org_text() from public;
grant execute on function hrms_link_org_text() to app_user;

select hrms_link_org_text();

-- An employee's reports, direct and indirect, for a login: the "team" record
-- scope (RBAC v2) and the manager's approval inbox. Security invoker, so RLS
-- keeps it inside the caller's tenant. Depth-capped against a bad cycle.
create or replace function hrms_team_employee_ids(p_user uuid) returns setof uuid
  language sql stable as
$$
  with recursive team(id, depth) as (
    select e.id, 1 from hrms_employees e
      join hrms_employees m on m.id = e.manager_id
     where m.user_id = p_user
    union
    select e.id, t.depth + 1 from hrms_employees e join team t on e.manager_id = t.id
     where t.depth < 20
  )
  select distinct id from team
$$;
revoke execute on function hrms_team_employee_ids(uuid) from public;
grant execute on function hrms_team_employee_ids(uuid) to app_user;
