-- ============================================================================
-- Migration 0052 — Module registry state and feature flags (D-01, D-02,
-- checklist 3A, §7.7)
--
--  * tenant_modules — which modules a tenant has on. The manifests themselves
--    (dependencies, keys, nav, jobs …) live in code, app/modules. A row's
--    `reason` says who turned it on: the owner ('user'), a dependency of an
--    app ('dependency'), a link/auto module whose sides are all on ('auto').
--    Disabling sets state = 'disabled' and keeps every row of the module's
--    data (D-02); purge is a separate delayed job (0054).
--  * feature_flags — platform-owned staged rollouts (e.g. offline POS),
--    independent of plans. tenant_id null = the global default; a tenant row
--    overrides it. Read through the owner pool: app_user holds no grant.
--
-- `entitlements` stays a real table for one release, kept in step with
-- tenant_modules by two triggers, so its readers (AI views list, dashboard,
-- jobs, billing page) and any code that still writes it keep working. Each
-- trigger writes only when the other side differs, so they settle at once.
--
-- Backfill: modules_backfill_from_entitlements() turns entitlements into
-- tenant_modules and adds the supporting modules from the dependency closure.
-- The closure table below mirrors app/modules/manifests.py;
-- tests/core/test_modules.py checks the two agree. Re-runnable.
-- ============================================================================

create table if not exists tenant_modules (
  tenant_id   uuid not null references tenants(id) on delete cascade,
  module_key  text not null,
  state       text not null default 'enabled' check (state in ('enabled', 'disabled')),
  reason      text not null default 'user' check (reason in ('user', 'dependency', 'auto')),
  enabled_by  uuid references users(id) on delete set null,
  settings    jsonb not null default '{}'::jsonb,
  changed_at  timestamptz not null default now(),
  primary key (tenant_id, module_key)
);

create table if not exists feature_flags (
  id          uuid primary key default gen_random_uuid(),
  flag_key    text not null,
  tenant_id   uuid references tenants(id) on delete cascade,     -- null = global default
  enabled     boolean not null default false,
  rollout_pct smallint check (rollout_pct between 0 and 100),
  updated_at  timestamptz not null default now(),
  unique nulls not distinct (flag_key, tenant_id)
);

insert into feature_flags (flag_key, tenant_id, enabled) values
  ('pos_offline', null, false),
  ('whatsapp',    null, false)
on conflict do nothing;

-- ── Grants and RLS (0032: nothing is granted by default) ────────────────────
grant select, insert, update on tenant_modules to app_user;   -- upsert from the modules screen
revoke all on feature_flags from app_user;                    -- owner pool only

do $$
declare t text;
begin
  foreach t in array array['tenant_modules', 'feature_flags'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

-- ── Keep entitlements in step (one release) ────────────────────────────────
create or replace function tenant_modules_to_entitlements() returns trigger
language plpgsql as $$
begin
  if new.module_key in ('crm', 'pos', 'hrms') then
    insert into entitlements (tenant_id, section_key, enabled)
    values (new.tenant_id, new.module_key, new.state = 'enabled')
    on conflict (tenant_id, section_key) do update set enabled = excluded.enabled
      where entitlements.enabled is distinct from excluded.enabled;
  end if;
  return null;
end$$;

drop trigger if exists tenant_modules_sync on tenant_modules;
create trigger tenant_modules_sync after insert or update of state on tenant_modules
  for each row execute function tenant_modules_to_entitlements();

create or replace function entitlements_to_tenant_modules() returns trigger
language plpgsql as $$
begin
  if new.section_key in ('crm', 'pos', 'hrms') then
    insert into tenant_modules (tenant_id, module_key, state, reason)
    values (new.tenant_id, new.section_key, case when new.enabled then 'enabled' else 'disabled' end, 'user')
    on conflict (tenant_id, module_key) do update set state = excluded.state, changed_at = now()
      where tenant_modules.state is distinct from excluded.state;
  end if;
  return null;
end$$;

drop trigger if exists entitlements_sync on entitlements;
create trigger entitlements_sync after insert or update of enabled on entitlements
  for each row execute function entitlements_to_tenant_modules();

-- ── Backfill (§7.7) ─────────────────────────────────────────────────────────
create or replace function modules_backfill_from_entitlements() returns void
language plpgsql as $$
begin
  insert into tenant_modules (tenant_id, module_key, state, reason)
  select tenant_id, section_key, case when enabled then 'enabled' else 'disabled' end, 'user'
    from entitlements where section_key in ('crm', 'pos', 'hrms')
  on conflict do nothing;

  -- Supporting and auto modules of each enabled app (app/modules/manifests.py).
  insert into tenant_modules (tenant_id, module_key, state, reason)
  select distinct on (e.tenant_id, d.module_key) e.tenant_id, d.module_key, 'enabled', d.reason
    from entitlements e
    join (values ('crm', 'contacts', 'dependency'),
                 ('pos', 'products', 'dependency'),
                 ('pos', 'contacts', 'dependency'),
                 ('pos', 'purchasing', 'auto'),
                 ('pos', 'fbr', 'auto'),
                 ('hrms', 'payroll', 'auto')) as d(app, module_key, reason)
      on d.app = e.section_key
   where e.enabled
   order by e.tenant_id, d.module_key, d.reason
  on conflict do nothing;

  -- Link module: cashier = employee PIN, once POS and HRMS are both on.
  insert into tenant_modules (tenant_id, module_key, state, reason)
  select p.tenant_id, 'pos_hrms', 'enabled', 'auto'
    from entitlements p join entitlements h on h.tenant_id = p.tenant_id
   where p.section_key = 'pos' and p.enabled and h.section_key = 'hrms' and h.enabled
  on conflict do nothing;
end$$;
revoke all on function modules_backfill_from_entitlements() from public;

select modules_backfill_from_entitlements();
