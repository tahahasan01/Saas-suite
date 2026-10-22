-- ============================================================================
-- Migration 0081 — Offline till sync (3D, D-20 to D-23, St01 slice E)
--
--  * pos_sales: a paid offline sale is never refused. What the server
--    couldn't accept as-is (price mismatch, closed session, clock skew,
--    underpayment, negative stock…) is recorded with needs_review and its
--    reasons, for a manager to resolve. synced_at is when the server got it
--    (now() for online sales): the Z-report counts what it knew at close and
--    lists what arrived after as late-synced. client_total_minor is what the
--    till charged.
--  * pos_products.row_version: a tenant-wide increasing number stamped on
--    every insert and update, so a till fetches only what changed since its
--    last pull (archiving is an update, so it reaches the till too).
-- ============================================================================

alter table pos_sales
  add column needs_review       boolean not null default false,
  add column review_reasons     text[] not null default '{}',
  add column client_total_minor bigint,
  add column synced_at          timestamptz not null default now(),
  add column reviewed_by        uuid references users(id) on delete set null,
  add column reviewed_at        timestamptz,
  add column review_note        text not null default '';
update pos_sales set synced_at = created_at;
create index pos_sales_review_idx on pos_sales (tenant_id) where needs_review;

create sequence pos_catalog_version_seq;
grant usage on sequence pos_catalog_version_seq to app_user;

alter table pos_products add column row_version bigint;
update pos_products set row_version = nextval('pos_catalog_version_seq');
alter table pos_products alter column row_version set not null;
create index pos_products_row_version_idx on pos_products (tenant_id, row_version);

create or replace function bos_stamp_row_version() returns trigger
language plpgsql as $$
begin
  new.row_version := nextval('pos_catalog_version_seq');
  return new;
end $$;

create trigger pos_products_row_version before insert or update on pos_products
  for each row execute function bos_stamp_row_version();
