-- ============================================================================
-- Migration 0010 — POS: products, sales, sale items
-- Web-first billing + inventory. Offline sync + hardware bridge come later.
-- Money in integer minor units; stock is numeric to allow weighed goods.
-- ============================================================================

create table if not exists pos_products (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  sku         text not null default '',
  barcode     text not null default '',
  category    text not null default '',
  unit        text not null default 'pcs',
  price_minor bigint not null default 0,     -- selling price
  cost_minor  bigint not null default 0,
  stock_qty   numeric(12,3) not null default 0,
  low_stock_at numeric(12,3) not null default 0,  -- threshold for reorder alert
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists pos_products_tenant_idx on pos_products(tenant_id) where active;
create index if not exists pos_products_barcode_idx on pos_products(tenant_id, barcode) where barcode <> '';
create index if not exists pos_products_name_trgm on pos_products using gin (name gin_trgm_ops);

create table if not exists pos_sales (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  cashier_id     uuid references users(id) on delete set null,
  subtotal_minor bigint not null default 0,
  discount_minor bigint not null default 0,
  total_minor    bigint not null default 0,
  paid_minor     bigint not null default 0,
  change_minor   bigint not null default 0,
  payment_method text not null default 'cash',  -- cash|card|jazzcash|easypaisa|bank
  item_count     int not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists pos_sales_tenant_idx on pos_sales(tenant_id, created_at desc);

create table if not exists pos_sale_items (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  sale_id          uuid not null references pos_sales(id) on delete cascade,
  product_id       uuid references pos_products(id) on delete set null,
  name             text not null,
  qty              numeric(12,3) not null default 1,
  price_minor      bigint not null default 0,     -- unit price snapshot
  line_total_minor bigint not null default 0
);
create index if not exists pos_sale_items_sale_idx on pos_sale_items(sale_id);
create index if not exists pos_sale_items_tenant_idx on pos_sale_items(tenant_id);

-- Grants + RLS
grant select, insert, update, delete on pos_products, pos_sales, pos_sale_items to app_user;
do $$
declare t text;
begin
  foreach t in array array['pos_products','pos_sales','pos_sale_items']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;
