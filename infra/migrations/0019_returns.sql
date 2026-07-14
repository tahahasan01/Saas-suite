-- ============================================================================
-- Migration 0019 — POS returns / refunds
--
-- No shop can operate without returns; Square has had them forever and their
-- absence alone disqualifies the product. Previously a wrong sale was permanent
-- and its stock could never come back.
--
-- Returns are recorded as their own documents rather than by mutating the sale:
-- the sale is what the customer was charged and is evidence (and, once filed,
-- an FBR invoice). History is appended to, never rewritten.
-- ============================================================================

create table if not exists pos_returns (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  sale_id      uuid not null references pos_sales(id) on delete cascade,
  cashier_id   uuid references users(id) on delete set null,
  reason       text not null default '',
  refund_minor bigint not null default 0,
  tax_minor    bigint not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists pos_returns_sale_idx on pos_returns(sale_id);
create index if not exists pos_returns_tenant_idx on pos_returns(tenant_id, created_at desc);

create table if not exists pos_return_items (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  return_id         uuid not null references pos_returns(id) on delete cascade,
  sale_item_id      uuid not null references pos_sale_items(id) on delete cascade,
  product_id        uuid references pos_products(id) on delete set null,
  name              text not null,
  qty               numeric(12,3) not null,
  line_refund_minor bigint not null default 0
);
create index if not exists pos_return_items_return_idx on pos_return_items(return_id);
-- Answers "how much of this line has already come back?" — the check that stops
-- a customer refunding three of two items across several visits.
create index if not exists pos_return_items_sale_item_idx on pos_return_items(sale_item_id);

-- FBR models a return as a Debit Note referencing the original invoice, so a
-- return needs its own submission record — which also references the sale.
alter table pos_fbr_invoices
  add column if not exists return_id uuid references pos_returns(id) on delete cascade;

-- unique(sale_id) from 0017 would now collide: a sale's invoice and each of its
-- returns' debit notes all carry the same sale_id. Split it into one invoice per
-- sale and one debit note per return.
alter table pos_fbr_invoices drop constraint if exists pos_fbr_invoices_sale_id_key;
create unique index if not exists pos_fbr_invoices_sale_uniq
  on pos_fbr_invoices(sale_id) where return_id is null;
create unique index if not exists pos_fbr_invoices_return_uniq
  on pos_fbr_invoices(return_id) where return_id is not null;

grant select, insert on pos_returns to app_user;
grant select, insert on pos_return_items to app_user;

alter table pos_returns enable row level security;
drop policy if exists tenant_isolation on pos_returns;
create policy tenant_isolation on pos_returns
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table pos_return_items enable row level security;
drop policy if exists tenant_isolation on pos_return_items;
create policy tenant_isolation on pos_return_items
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
