-- ============================================================================
-- Migration 0082 — A contact merge moves khata entries to the winner
--
-- customer_ledger is append-only (0079: select, insert). Merging two
-- contacts re-points the loser's records to the winner (contact_merge,
-- 'repoint'), so a customer's khata balance follows the person. That needs
-- an UPDATE of contact_id only: amounts, kinds and links stay immutable.
-- The audit trigger (0079) records each re-point.
-- ============================================================================

grant update (contact_id) on customer_ledger to app_user;
