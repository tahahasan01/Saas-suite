-- ============================================================================
-- Migration 0075 — Catalog v2 and stock (3C, St01 P1/P2, M10, St01 risk 5)
--
--  * pos_categories: categories are records (the till's old free-text
--    `category` is kept as the label for one release; every distinct value
--    becomes a record here).
--  * pos_products gain category_id, track_stock (a haircut or a delivery
--    charge has no stock), and light variants: group_id points at the
--    group's first product, attributes holds {"Size": "L", ...}.
--  * pos_product_barcodes: extra barcodes for a product, each scanning a
--    quantity (a carton of 12). One barcode, one product, per tenant.
--  * pos_barcode_rules: the tenant's weight/price barcodes (EAN-13 from a
--    scale: 2-digit prefix, 5-digit item code = the product's SKU, 5-digit
--    value, check digit).
--  * pos_stock_moves: the append-only ledger behind stock_qty. Every sale,
--    return, receipt and adjustment writes a move in the same transaction;
--    existing stock opens the ledger with one 'opening' move per product.
--  * tenants.allow_negative_stock: off by default, so selling more than is on
--    hand is refused (offline oversell is flagged, not refused, in 3D).
-- ============================================================================

alter table pos_products add constraint pos_products_tenant_id_key unique (tenant_id, id);

create table pos_categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  position    int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index pos_categories_name_key on pos_categories (tenant_id, lower(btrim(name)));

alter table pos_products
  add column category_id uuid,
  add column track_stock boolean not null default true,
  add column group_id uuid,
  add column attributes jsonb not null default '{}'
    check (jsonb_typeof(attributes) = 'object'),
  add constraint pos_products_category_fk foreign key (tenant_id, category_id)
    references pos_categories (tenant_id, id) on delete set null (category_id),
  add constraint pos_products_group_fk foreign key (tenant_id, group_id)
    references pos_products (tenant_id, id) on delete set null (group_id);
create index pos_products_category_idx on pos_products (tenant_id, category_id);
create index pos_products_group_idx on pos_products (group_id) where group_id is not null;

insert into pos_categories (tenant_id, name)
select distinct on (tenant_id, lower(btrim(category))) tenant_id, btrim(category)
  from pos_products where btrim(category) <> ''
 order by tenant_id, lower(btrim(category)), btrim(category);
update pos_products p set category_id = c.id
  from pos_categories c
 where c.tenant_id = p.tenant_id and lower(btrim(c.name)) = lower(btrim(p.category)) and btrim(p.category) <> '';

create table pos_product_barcodes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  product_id  uuid not null,
  barcode     text not null check (barcode ~ '^[0-9A-Za-z-]{3,40}$'),
  qty         numeric(12,3) not null default 1 check (qty > 0),
  label       text not null default '' check (length(label) <= 60),
  created_at  timestamptz not null default now(),
  foreign key (tenant_id, product_id) references pos_products (tenant_id, id) on delete cascade,
  unique (tenant_id, barcode)
);

create table pos_barcode_rules (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  prefix         text not null check (prefix ~ '^2[0-9]$'),
  kind           text not null,
  value_decimals int not null default 3 check (value_decimals between 0 and 3),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  constraint pos_barcode_rules_kind_check check (kind in ('weight', 'price')),
  unique (tenant_id, prefix)
);

create table pos_stock_moves (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  product_id  uuid not null,
  qty_delta   numeric(14,3) not null check (qty_delta <> 0),
  reason      text not null,
  ref_id      uuid,                       -- the sale, return, PO or session behind it
  note        text not null default '' check (length(note) <= 300),
  user_id     uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  foreign key (tenant_id, product_id) references pos_products (tenant_id, id) on delete cascade,
  constraint pos_stock_moves_reason_check
    check (reason in ('opening', 'sale', 'return', 'purchase', 'adjustment', 'damage', 'count', 'void'))
);
create index pos_stock_moves_product_idx on pos_stock_moves (product_id, created_at desc);

insert into pos_stock_moves (tenant_id, product_id, qty_delta, reason, note, created_at)
select tenant_id, id, stock_qty, 'opening', 'Stock on hand when the ledger started', now()
  from pos_products where stock_qty <> 0;

alter table tenants add column allow_negative_stock boolean not null default false;
grant update (allow_negative_stock) on tenants to app_user;

grant select, insert, update on pos_categories to app_user;          -- retired, never deleted
grant select, insert, delete on pos_product_barcodes to app_user;
grant select, insert, update, delete on pos_barcode_rules to app_user;
grant select, insert on pos_stock_moves to app_user;                  -- append-only

do $$
declare t text;
begin
  foreach t in array array['pos_categories', 'pos_product_barcodes', 'pos_barcode_rules', 'pos_stock_moves'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

call bos_branch_scope('pos_stock_moves', true);

create trigger audit after insert or update or delete on pos_categories for each row
  execute function audit_row('name', 'position', 'active');
create trigger audit after insert or update or delete on pos_barcode_rules for each row
  execute function audit_row('prefix', 'kind', 'value_decimals', 'active');
