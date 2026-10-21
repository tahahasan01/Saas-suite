-- ============================================================================
-- Migration 0053 — RBAC v2: several roles per user, inheritance, scoped
-- grants, teams (D-04, TR-SEC-35/36, checklist 3A, §7.7)
--
--  * user_roles     — a user holds any number of roles. users.role_id stays
--                     (the "primary" role, still read by older code) and a
--                     trigger keeps it in user_roles, whoever writes users.
--  * role_inherits  — a role includes another role's grants (no self-loop;
--                     the API refuses cycles, the evaluator's recursive
--                     `union` would stop one anyway).
--  * role_grants    — permission key pattern + scope: an exact key
--                     ('crm.lead.read'), a module ('crm.*') or, for the
--                     Owner template only, '*'. Scope own < team < branch < all.
--  * teams, team_members — what the `team` scope means: a record is in my
--                     team's scope when its owner shares a team with me.
--  * roles.rbac_v2  — set once a role is created or edited through /roles; the
--                     one-release shim (app/rbac.py) lets the old
--                     (section, action) grants decide only for roles without it.
--
-- Backfill (TR-SEC-36): users.role_id -> user_roles; Owner roles -> '*' at
-- 'all'; every other role's `permissions` rows -> role_grants through the
-- reviewed mapping below, generated from the key registry in app/rbac.py
-- (each key's declared legacy grant). Keys registered later are added by
-- `python -m scripts.backfill_role_grants`; until then the shim logs the gap.
-- The `permissions` table is kept, read-only in spirit, for the shim release.
-- ============================================================================

alter table roles
  add column if not exists template_key text,
  add column if not exists description  text not null default '',
  add column if not exists rbac_v2      boolean not null default false;

create table if not exists user_roles (
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  role_id    uuid not null references roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);
create index if not exists user_roles_role_idx on user_roles (role_id);

create table if not exists role_inherits (
  tenant_id   uuid not null references tenants(id) on delete cascade,
  role_id     uuid not null references roles(id) on delete cascade,
  inherits_id uuid not null references roles(id) on delete cascade,
  primary key (role_id, inherits_id),
  check (role_id <> inherits_id)
);

create table if not exists role_grants (
  tenant_id      uuid not null references tenants(id) on delete cascade,
  role_id        uuid not null references roles(id) on delete cascade,
  permission_key text not null,
  scope          text not null default 'all' check (scope in ('own', 'team', 'branch', 'all')),
  primary key (role_id, permission_key)
);

create table if not exists teams (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null,
  lead_user_id uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists team_members (
  tenant_id uuid not null references tenants(id) on delete cascade,
  team_id   uuid not null references teams(id) on delete cascade,
  user_id   uuid not null references users(id) on delete cascade,
  primary key (team_id, user_id)
);
create index if not exists team_members_user_idx on team_members (user_id);

-- ── Grants and RLS (0032: nothing is granted by default) ────────────────────
-- Role and membership sets are replaced wholesale (delete + insert).
grant update, delete       on roles         to app_user;   -- rename, describe, delete a custom role
grant select, insert, delete on user_roles    to app_user;
grant select, insert, delete on role_inherits to app_user;
grant select, insert, delete on role_grants   to app_user;
grant select, insert, update, delete on teams to app_user;
grant select, insert, delete on team_members  to app_user;

do $$
declare t text;
begin
  foreach t in array array['user_roles', 'role_inherits', 'role_grants', 'teams', 'team_members'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

-- ── users.role_id is always one of the user's roles ────────────────────────
create or replace function users_sync_user_roles() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.role_id is not null and old.role_id is distinct from new.role_id then
    delete from user_roles where user_id = new.id and role_id = old.role_id;
  end if;
  if new.role_id is not null then
    insert into user_roles (tenant_id, user_id, role_id) values (new.tenant_id, new.id, new.role_id)
    on conflict do nothing;
  end if;
  return null;
end$$;

drop trigger if exists users_user_roles on users;
create trigger users_user_roles after insert or update of role_id on users
  for each row execute function users_sync_user_roles();

-- ── Backfill ────────────────────────────────────────────────────────────────
insert into user_roles (tenant_id, user_id, role_id)
select tenant_id, id, role_id from users where role_id is not null
on conflict do nothing;

update roles set template_key = 'owner'    where is_system and name = 'Owner'    and template_key is null;
update roles set template_key = 'employee' where is_system and name = 'Employee' and template_key is null;

insert into role_grants (tenant_id, role_id, permission_key, scope)
select tenant_id, id, '*', 'all' from roles where template_key = 'owner'
on conflict do nothing;

insert into role_grants (tenant_id, role_id, permission_key, scope)
select distinct p.tenant_id, p.role_id, m.permission_key, 'all'
  from permissions p
  join roles r on r.id = p.role_id and r.template_key is distinct from 'owner'
  join (values
    ('crm','read','crm.lead.export'), ('crm','read','crm.lead.read'),
    ('crm','read','invoicing.invoice.read'), ('crm','write','crm.activity.manage'),
    ('crm','write','crm.lead.create'), ('crm','write','crm.lead.import'), ('crm','write','crm.lead.update'),
    ('crm','write','invoicing.invoice.create'), ('crm','admin','crm.activity.manage'),
    ('crm','admin','crm.lead.create'), ('crm','admin','crm.lead.export'), ('crm','admin','crm.lead.import'),
    ('crm','admin','crm.lead.read'), ('crm','admin','crm.lead.update'),
    ('crm','admin','invoicing.invoice.create'), ('crm','admin','invoicing.invoice.read'),
    ('pos','read','fbr.document.read'), ('pos','read','fbr.settings.read'),
    ('pos','read','pos.report.sales'), ('pos','read','pos.sale.read'), ('pos','read','pos.session.read'),
    ('pos','read','products.product.export'), ('pos','read','products.product.read'),
    ('pos','read','purchasing.po.read'), ('pos','read','purchasing.supplier.read'),
    ('pos','write','pos.sale.create'), ('pos','write','pos.sale.refund'),
    ('pos','write','pos.session.close'), ('pos','write','pos.session.open'),
    ('pos','write','products.product.create'), ('pos','write','products.product.import'),
    ('pos','write','products.product.update'), ('pos','write','purchasing.po.cancel'),
    ('pos','write','purchasing.po.create'), ('pos','write','purchasing.po.receive'),
    ('pos','write','purchasing.supplier.manage'), ('pos','admin','fbr.document.read'),
    ('pos','admin','fbr.settings.manage'), ('pos','admin','fbr.settings.read'),
    ('pos','admin','pos.report.sales'), ('pos','admin','pos.sale.create'), ('pos','admin','pos.sale.read'),
    ('pos','admin','pos.sale.refund'), ('pos','admin','pos.session.close'),
    ('pos','admin','pos.session.open'), ('pos','admin','pos.session.read'),
    ('pos','admin','products.cost.read'), ('pos','admin','products.product.create'),
    ('pos','admin','products.product.export'), ('pos','admin','products.product.import'),
    ('pos','admin','products.product.read'), ('pos','admin','products.product.update'),
    ('pos','admin','purchasing.po.cancel'), ('pos','admin','purchasing.po.create'),
    ('pos','admin','purchasing.po.read'), ('pos','admin','purchasing.po.receive'),
    ('pos','admin','purchasing.supplier.manage'), ('pos','admin','purchasing.supplier.read'),
    ('hrms','read','hrms.attendance.read'), ('hrms','read','hrms.employee.read'),
    ('hrms','read','hrms.leave.read'), ('hrms','read','hrms.shift.read'),
    ('hrms','write','hrms.attendance.write'), ('hrms','write','hrms.employee.create'),
    ('hrms','write','hrms.employee.update'), ('hrms','write','hrms.holiday.manage'),
    ('hrms','write','hrms.leave.request'), ('hrms','write','hrms.shift.assign'),
    ('hrms','admin','hrms.attendance.read'), ('hrms','admin','hrms.attendance.write'),
    ('hrms','admin','hrms.employee.create'), ('hrms','admin','hrms.employee.invite'),
    ('hrms','admin','hrms.employee.read'), ('hrms','admin','hrms.employee.update'),
    ('hrms','admin','hrms.holiday.manage'), ('hrms','admin','hrms.leave.approve'),
    ('hrms','admin','hrms.leave.read'), ('hrms','admin','hrms.leave.request'),
    ('hrms','admin','hrms.settings.manage'), ('hrms','admin','hrms.shift.assign'),
    ('hrms','admin','hrms.shift.manage'), ('hrms','admin','hrms.shift.read'),
    ('settings','read','settings.team.read'), ('settings','read','settings.workflows.read'),
    ('settings','admin','settings.billing.manage'), ('settings','admin','settings.modules.manage'),
    ('settings','admin','settings.roles.manage'), ('settings','admin','settings.team.manage'),
    ('settings','admin','settings.team.read'), ('settings','admin','settings.workflows.manage'),
    ('settings','admin','settings.workflows.read'), ('accounts','admin','invoicing.invoice.approve'),
    ('payroll','read','payroll.run.read'), ('payroll','read','payroll.salary.read'),
    ('payroll','write','payroll.run.calculate'), ('payroll','write','payroll.run.create'),
    ('payroll','write','payroll.run.read'), ('payroll','write','payroll.salary.read'),
    ('payroll','write','payroll.salary.update'), ('payroll','admin','payroll.report.export'),
    ('payroll','admin','payroll.run.approve'), ('payroll','admin','payroll.run.calculate'),
    ('payroll','admin','payroll.run.cancel'), ('payroll','admin','payroll.run.create'),
    ('payroll','admin','payroll.run.lock'), ('payroll','admin','payroll.run.pay'),
    ('payroll','admin','payroll.run.read'), ('payroll','admin','payroll.run.reopen'),
    ('payroll','admin','payroll.salary.read'), ('payroll','admin','payroll.salary.update'),
    ('payroll','admin','payroll.settings.manage')
  ) as m(section, action, permission_key) on m.section = p.section and m.action = p.action
on conflict do nothing;
