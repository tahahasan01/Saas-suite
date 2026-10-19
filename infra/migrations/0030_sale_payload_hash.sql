-- ============================================================================
-- Migration 0030 — Fingerprint of what a sale was (D-81)
--
-- A replayed client_uuid must be the same cart. If the first attempt was
-- recorded but the till never heard back and the cashier changed the cart,
-- returning the old sale would leave the new items uncharged. The API stores
-- a SHA-256 of the sale request (items, discount, paid, method) and refuses a
-- replay whose fingerprint differs (409). Null for sales recorded before this.
-- ============================================================================

alter table pos_sales add column if not exists payload_sha256 text;
