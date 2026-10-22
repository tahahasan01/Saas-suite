-- ============================================================================
-- Migration 0125 — Send an invoice by email (research sweep 2026-10-23, TRD
-- /invoices/{id}/send)
--
--  * invoices.last_sent_at: when it was last emailed to the customer. The
--    email itself goes through the outbox, which holds only the invoice id
--    and the address; the PDF is built at delivery.
-- ============================================================================

alter table invoices add column last_sent_at timestamptz;
