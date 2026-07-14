-- ============================================================================
-- Migration 0023 — Suppliers and purchase orders
--
-- The restock advisor recommends a quantity, and until now there was no way to
-- receive it: stock only ever moved by sale decrement or manual overwrite.
-- A PO is the missing inbound document — goods arrive against it, stock rises
-- through it, and partial deliveries (the norm in Pakistani wholesale) stay
-- reconciled line by line via received_qty.
-- ============================================================================

create table if not exists pos_suppliers (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  phone      text not null default '',
  email      text not null default '',
  notes      text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists pos_suppliers_tenant_idx on pos_suppliers(tenant_id, name);

create table if not exists pos_purchase_orders (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  supplier_id uuid references pos_suppliers(id) on delete set null,
  created_by  uuid references users(id) on delete set null,
  status      text not null default 'ordered',   -- ordered | received | cancelled
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  received_at timestamptz
);
create index if not exists pos_po_tenant_idx on pos_purchase_orders(tenant_id, status, created_at desc);

create table if not exists pos_po_items (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  po_id        uuid not null references pos_purchase_orders(id) on delete cascade,
  product_id   uuid references pos_products(id) on delete set null,
  name         text not null,
  qty          numeric(12,3) not null,
  cost_minor   bigint not null default 0,        -- per unit
  received_qty numeric(12,3) not null default 0
);
create index if not exists pos_po_items_po_idx on pos_po_items(po_id);

grant select, insert, update on pos_suppliers, pos_purchase_orders, pos_po_items to app_user;

alter table pos_suppliers enable row level security;
drop policy if exists tenant_isolation on pos_suppliers;
create policy tenant_isolation on pos_suppliers
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table pos_purchase_orders enable row level security;
drop policy if exists tenant_isolation on pos_purchase_orders;
create policy tenant_isolation on pos_purchase_orders
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table pos_po_items enable row level security;
drop policy if exists tenant_isolation on pos_po_items;
create policy tenant_isolation on pos_po_items
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
