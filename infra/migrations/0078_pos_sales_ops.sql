-- ============================================================================
-- Migration 0078 — Sales operations (3C, St01 P0/P1, D-06, D-27)
--
--  * Receipt numbers: pos_sales.receipt_no from sequences ('pos.receipt', per
--    register, R1-2026-27-000042), taken as the sale's last step (D-06).
--    offline_ref holds a till's own <REG>-<DEV>-NNNNNN number (3D, D-25).
--  * print_count: the first print is the original; later ones are stamped
--    DUPLICATE.
--  * Void: status 'void' with who, when and why. A void is a full return of
--    what is left (refund into the session, stock back, FBR debit note),
--    then the sale is marked void.
--  * Lines remember their list price and who approved a discount or a price
--    override.
--  * pos_held_bills: parked carts (D-27), resumed once.
-- ============================================================================

alter table pos_sales
  add column receipt_no text,
  add column offline_ref text,
  add column print_count int not null default 0 check (print_count >= 0),
  add column status text not null default 'completed',
  add column void_reason text not null default '',
  add column voided_by uuid references users(id) on delete set null,
  add column voided_at timestamptz,
  add constraint pos_sales_status_check check (status in ('completed', 'void'));
create unique index pos_sales_receipt_key on pos_sales (tenant_id, receipt_no) where receipt_no is not null;
create unique index pos_sales_offline_ref_key on pos_sales (tenant_id, offline_ref) where offline_ref is not null;
create index pos_sales_history_idx on pos_sales (tenant_id, created_at desc);

alter table pos_sale_items
  add column list_price_minor bigint,
  add column approved_by uuid references users(id) on delete set null;

create table pos_held_bills (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  register_id uuid,
  user_id     uuid references users(id) on delete set null,
  label       text not null default '' check (length(label) <= 60),
  cart        jsonb not null check (jsonb_typeof(cart) = 'object' and length(cart::text) <= 65536),
  created_at  timestamptz not null default now(),
  foreign key (tenant_id, register_id) references pos_registers (tenant_id, id) on delete cascade
);
create index pos_held_bills_idx on pos_held_bills (tenant_id, created_at desc);

grant select, insert, delete on pos_held_bills to app_user;
alter table pos_held_bills enable row level security;
create policy tenant_isolation on pos_held_bills
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
call bos_branch_scope('pos_held_bills', true);
