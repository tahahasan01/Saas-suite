-- ============================================================================
-- Migration 0087 — Assets issued to staff (wave A, H22, St10)
--
--  * hrms_assets — the register: name, category, a unique tag, serial,
--    purchase date and value (paisa), condition, status
--    (available | issued | retired | lost). Retired or lost assets are kept.
--  * hrms_asset_assignments — who held it, from when until when, and the
--    condition it came back in. At most one open assignment per asset (a
--    partial unique index); history is never deleted.
-- ============================================================================

create table if not exists hrms_assets (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 120),
  category      text not null default 'other',
  tag           text,                                  -- the sticker on it; unique per tenant when set
  serial_no     text not null default '' check (length(serial_no) <= 80),
  purchased_on  date,
  value_minor   bigint check (value_minor >= 0),
  condition     text not null default 'good',
  status        text not null default 'available',
  note          text not null default '' check (length(note) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists hrms_assets_tag_uq on hrms_assets (tenant_id, lower(tag)) where tag is not null;
create index if not exists hrms_assets_tenant_idx on hrms_assets (tenant_id, status);

create table if not exists hrms_asset_assignments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  asset_id         uuid not null references hrms_assets(id) on delete cascade,
  employee_id      uuid not null references hrms_employees(id) on delete cascade,
  issued_at        timestamptz not null default now(),
  issued_by        uuid references users(id) on delete set null,
  issue_note       text not null default '' check (length(issue_note) <= 500),
  returned_at      timestamptz,
  return_condition text,
  return_note      text not null default '' check (length(return_note) <= 500),
  check (returned_at is null or returned_at >= issued_at)
);
create unique index if not exists hrms_asset_assignments_open_uq
  on hrms_asset_assignments (asset_id) where returned_at is null;
create index if not exists hrms_asset_assignments_employee_idx
  on hrms_asset_assignments (tenant_id, employee_id) where returned_at is null;

grant select, insert, update on hrms_assets            to app_user;   -- retired, never deleted
grant select, insert, update on hrms_asset_assignments to app_user;   -- closed on return, never deleted

do $$
declare t text;
begin
  foreach t in array array['hrms_assets','hrms_asset_assignments']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

alter table hrms_assets drop constraint if exists hrms_assets_category_check;
alter table hrms_assets add constraint hrms_assets_category_check
  check (category in ('laptop', 'desktop', 'phone', 'tablet', 'sim', 'vehicle', 'furniture', 'tool', 'uniform', 'other'));
alter table hrms_assets drop constraint if exists hrms_assets_condition_check;
alter table hrms_assets add constraint hrms_assets_condition_check
  check (condition in ('new', 'good', 'fair', 'damaged'));
alter table hrms_assets drop constraint if exists hrms_assets_status_check;
alter table hrms_assets add constraint hrms_assets_status_check
  check (status in ('available', 'issued', 'retired', 'lost'));
alter table hrms_asset_assignments drop constraint if exists hrms_asset_assignments_return_condition_check;
alter table hrms_asset_assignments add constraint hrms_asset_assignments_return_condition_check
  check (return_condition is null or return_condition in ('new', 'good', 'fair', 'damaged'));

drop trigger if exists audit on hrms_assets;
create trigger audit after insert or update on hrms_assets for each row
  execute function audit_row('name','category','tag','serial_no','value_minor','condition','status');
drop trigger if exists audit on hrms_asset_assignments;
create trigger audit after insert or update on hrms_asset_assignments for each row
  execute function audit_row('asset_id','employee_id','returned_at','return_condition');
