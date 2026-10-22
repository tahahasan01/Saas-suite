-- ============================================================================
-- Migration 0089 — Table service set-up (wave B, P22/P23, study 11)
--
--  * restaurant_floors: a hall, a roof, a family section, per branch.
--  * restaurant_tables: numbered tables on a floor, with seats. A table
--    carries its floor's branch (a composite foreign key keeps them equal),
--    so branch scoping applies to tables as well as floors.
--  * restaurant_stations: where food is made (kitchen, BBQ, drinks), per
--    branch. restaurant_station_categories says which product categories a
--    station prepares: kitchen tickets are routed by it (next slice).
--  Floors, tables and stations are retired, never deleted: orders will point
--  at them.
-- ============================================================================

create table restaurant_floors (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  branch_id   uuid,                         -- filled and required by bos_branch_scope below
  name        text not null check (length(btrim(name)) between 1 and 40),
  position    int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, id)
);

create table restaurant_tables (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  floor_id    uuid not null,
  branch_id   uuid not null,
  label       text not null check (length(btrim(label)) between 1 and 12),
  seats       int not null default 4 check (seats between 1 and 50),
  position    int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index restaurant_tables_label_key on restaurant_tables (floor_id, lower(btrim(label)));

create table restaurant_stations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  branch_id   uuid,
  name        text not null check (length(btrim(name)) between 1 and 40),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, id)
);

create table restaurant_station_categories (
  tenant_id   uuid not null references tenants(id) on delete cascade,
  station_id  uuid not null,
  category_id uuid not null,
  primary key (station_id, category_id),
  foreign key (tenant_id, station_id) references restaurant_stations (tenant_id, id) on delete cascade,
  foreign key (tenant_id, category_id) references pos_categories (tenant_id, id)
);

call bos_branch_scope('restaurant_floors', true);
call bos_branch_scope('restaurant_tables', true);
call bos_branch_scope('restaurant_stations', true);

-- A table is always on its floor's branch.
alter table restaurant_floors add constraint restaurant_floors_branch_key unique (tenant_id, id, branch_id);
alter table restaurant_tables add constraint restaurant_tables_floor_fk
  foreign key (tenant_id, floor_id, branch_id) references restaurant_floors (tenant_id, id, branch_id);

-- Names are unique per branch, ignoring case.
create unique index restaurant_floors_name_key on restaurant_floors (tenant_id, branch_id, lower(btrim(name)));
create unique index restaurant_stations_name_key on restaurant_stations (tenant_id, branch_id, lower(btrim(name)));

grant select, insert, update on restaurant_floors   to app_user;   -- retired, never deleted
grant select, insert, update on restaurant_tables   to app_user;
grant select, insert, update on restaurant_stations to app_user;
grant select, insert, delete on restaurant_station_categories to app_user;   -- the list is replaced

do $$
declare t text;
begin
  foreach t in array array['restaurant_floors','restaurant_tables','restaurant_stations',
                           'restaurant_station_categories']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

drop trigger if exists audit on restaurant_floors;
create trigger audit after insert or update on restaurant_floors for each row
  execute function audit_row('name','position','active');
drop trigger if exists audit on restaurant_tables;
create trigger audit after insert or update on restaurant_tables for each row
  execute function audit_row('label','seats','active');
drop trigger if exists audit on restaurant_stations;
create trigger audit after insert or update on restaurant_stations for each row
  execute function audit_row('name','active');
