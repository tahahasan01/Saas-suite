-- ============================================================================
-- Migration 0094 — Restaurant orders and kitchen tickets
-- (wave B, P22/P23/P39/P40, study 11)
--
--  * restaurant_orders: an open ticket before payment. Dine-in at a table
--    (one open order per table) or takeaway with a token (per branch, per
--    day). Paying it (next slice) links the sale and closes it.
--  * restaurant_order_lines: items with a note ("less spicy"); the price is a
--    display snapshot only: the sale path prices the bill.
--  * restaurant_kots: kitchen order tickets, one per station per send, or a
--    VOID ticket when a sent item is cancelled (with its reason and approver:
--    the void report reads these). station_id null = the counter, for items
--    no station makes. status is for the kitchen screen (next slice).
--  * restaurant_kot_lines: what each ticket carried. An order line's sent
--    quantity is its order tickets minus its void tickets.
-- ============================================================================

create table restaurant_orders (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  branch_id   uuid not null,
  order_type  text not null,
  table_id    uuid,
  token       int check (token > 0),
  guests      int check (guests between 1 and 100),
  status      text not null default 'open',
  note        text not null default '' check (length(note) <= 300),
  opened_by   uuid references users(id) on delete set null,
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz,
  sale_id     uuid,
  constraint restaurant_orders_order_type_check check (order_type in ('dine_in', 'takeaway')),
  constraint restaurant_orders_status_check check (status in ('open', 'paid', 'cancelled')),
  constraint restaurant_orders_table_needed check ((order_type = 'dine_in') = (table_id is not null)),
  constraint restaurant_orders_token_needed check ((order_type = 'takeaway') = (token is not null)),
  foreign key (tenant_id, table_id) references restaurant_tables (tenant_id, id),
  unique (tenant_id, id)
);
create unique index restaurant_orders_one_per_table on restaurant_orders (table_id) where status = 'open';
create index restaurant_orders_open_idx on restaurant_orders (tenant_id, branch_id, status, opened_at);

create table restaurant_order_lines (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  order_id          uuid not null,
  product_id        uuid not null,
  name              text not null,
  unit_price_minor  bigint not null check (unit_price_minor >= 0),
  qty               numeric(10,3) not null check (qty >= 0),
  note              text not null default '' check (length(note) <= 200),
  created_by        uuid references users(id) on delete set null,
  created_at        timestamptz not null default now(),
  foreign key (tenant_id, order_id) references restaurant_orders (tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references pos_products (tenant_id, id),
  unique (tenant_id, id)
);
create index restaurant_order_lines_order_idx on restaurant_order_lines (order_id);

create table restaurant_kots (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  branch_id     uuid not null,
  order_id      uuid not null,
  station_id    uuid,
  number        int not null check (number > 0),
  kind          text not null default 'order',
  status        text not null default 'new',
  reason        text not null default '' check (length(reason) <= 200),
  approved_by   uuid references users(id) on delete set null,
  print_count   int not null default 0 check (print_count >= 0),
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  ready_at      timestamptz,
  constraint restaurant_kots_kind_check check (kind in ('order', 'void')),
  constraint restaurant_kots_status_check check (status in ('new', 'ready')),
  foreign key (tenant_id, order_id) references restaurant_orders (tenant_id, id) on delete cascade,
  foreign key (tenant_id, station_id) references restaurant_stations (tenant_id, id),
  unique (tenant_id, id)
);
create index restaurant_kots_station_idx on restaurant_kots (tenant_id, branch_id, station_id, status, created_at);

create table restaurant_kot_lines (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  kot_id         uuid not null,
  order_line_id  uuid not null,
  name           text not null,
  qty            numeric(10,3) not null check (qty > 0),
  note           text not null default '' check (length(note) <= 200),
  foreign key (tenant_id, kot_id) references restaurant_kots (tenant_id, id) on delete cascade,
  foreign key (tenant_id, order_line_id) references restaurant_order_lines (tenant_id, id) on delete cascade
);
create index restaurant_kot_lines_line_idx on restaurant_kot_lines (order_line_id);

call bos_branch_scope('restaurant_orders', true);
call bos_branch_scope('restaurant_kots', true);

grant select, insert, update on restaurant_orders to app_user;        -- closed or cancelled, never deleted
grant select, insert, update on restaurant_order_lines to app_user;   -- voids lower qty; never deleted
grant select, insert, update on restaurant_kots to app_user;          -- printed and readied
grant select, insert on restaurant_kot_lines to app_user;             -- a ticket never changes

do $$
declare t text;
begin
  foreach t in array array['restaurant_orders','restaurant_order_lines','restaurant_kots','restaurant_kot_lines']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

drop trigger if exists audit on restaurant_orders;
create trigger audit after insert or update on restaurant_orders for each row
  execute function audit_row('order_type', 'table_id', 'status', 'sale_id');
drop trigger if exists audit on restaurant_kots;
create trigger audit after insert or update on restaurant_kots for each row
  execute function audit_row('kind', 'station_id', 'reason', 'approved_by', 'status');
