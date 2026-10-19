-- ============================================================================
-- Migration 0028 — Idempotent sale submission (decisions D-20, D-81)
--
-- The till generates client_uuid when a cart opens and sends it with the sale.
-- The unique index makes the database the referee: however many times the
-- same cart arrives (double-tap, retry, a request completing after the till
-- gave up), only one sale row can exist; the API replays it for the others.
-- Nullable so older clients without a key keep working.
-- ============================================================================

alter table pos_sales add column if not exists client_uuid uuid;

create unique index if not exists pos_sales_client_uuid_uniq
  on pos_sales(tenant_id, client_uuid) where client_uuid is not null;
