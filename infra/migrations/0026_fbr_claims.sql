-- ============================================================================
-- Migration 0026 — FBR outbox claims and back-off
--
-- A row is now claimed (status 'sending') before it is transmitted, so the
-- post-sale attempt and the retry job — or two overlapping retry runs — can
-- never file the same document twice. A claim older than the stale window is
-- recovered by the retry job (the process holding it died mid-flight).
--
-- next_attempt_at lets a row that is waiting on something (a debit note whose
-- sale isn't filed yet) step out of the retry batch instead of occupying it.
--
-- Status values: pending | sending | submitted | failed.
-- ============================================================================

alter table pos_fbr_invoices
  add column if not exists claimed_at      timestamptz,
  add column if not exists next_attempt_at timestamptz not null default now();

drop index if exists pos_fbr_pending_idx;
create index if not exists pos_fbr_due_idx
  on pos_fbr_invoices(next_attempt_at)
  where status in ('pending', 'sending');
