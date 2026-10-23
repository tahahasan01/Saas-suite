-- ============================================================================
-- Migration 0128 — Email a quote (wave D leftovers)
--
--  * crm_quotes.last_emailed_at: when the quote was last emailed. The email
--    goes through the outbox, which holds only the quote id and address; the
--    link and the PDF are made at delivery, and a quote closed in between is
--    not sent.
-- ============================================================================

alter table crm_quotes add column last_emailed_at timestamptz;
