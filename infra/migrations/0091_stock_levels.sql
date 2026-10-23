-- ============================================================================
-- Migration 0091 — Stock per branch or warehouse (wave B, study 06 gaps 23/25)
--
--  * pos_stock_levels: the quantity of each product at each branch. A
--    warehouse is a branch without tills. Branch-scoped like the ledger, so
--    staff limited to a branch see only its stock.
--  * pos_products.stock_qty stays: it is now the company total, kept equal
--    to the sum of the levels by catalog.move() in the same transaction.
--  * Backfill: each branch's level is the sum of its ledger moves; anything
--    the ledger doesn't explain (stock older than 0075's opening moves) is
--    put at the default branch so the levels add up to stock_qty.
-- ============================================================================

create table pos_stock_levels (
  tenant_id   uuid not null references tenants(id) on delete cascade,
  product_id  uuid not null,
  branch_id   uuid not null,
  qty         numeric(14,3) not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (product_id, branch_id),
  foreign key (tenant_id, product_id) references pos_products (tenant_id, id) on delete cascade
);
call bos_branch_scope('pos_stock_levels', true);

insert into pos_stock_levels (tenant_id, product_id, branch_id, qty)
select m.tenant_id, m.product_id, m.branch_id, sum(m.qty_delta)
  from pos_stock_moves m join pos_products p on p.id = m.product_id
 where p.track_stock
 group by m.tenant_id, m.product_id, m.branch_id;

insert into pos_stock_levels (tenant_id, product_id, branch_id, qty)
select p.tenant_id, p.id, b.id, p.stock_qty - coalesce(l.total, 0)
  from pos_products p
  join branches b on b.tenant_id = p.tenant_id and b.is_default
  left join (select product_id, sum(qty) as total from pos_stock_levels group by product_id) l on l.product_id = p.id
 where p.track_stock and p.stock_qty <> coalesce(l.total, 0)
on conflict (product_id, branch_id) do update set qty = pos_stock_levels.qty + excluded.qty;

grant select, insert, update on pos_stock_levels to app_user;   -- moves only through catalog.move()

alter table pos_stock_levels enable row level security;
create policy tenant_isolation on pos_stock_levels
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
