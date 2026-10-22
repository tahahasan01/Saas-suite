-- ============================================================================
-- Migration 0084 — Warn when an offline till's sales stop reaching us
-- (checklist 3D, St01 risk 2)
--
-- A till reports its unsent sales in every heartbeat (0076: outbox_count,
-- oldest_pending_at). The `pos.outbox_ageing` job tells the owner when the
-- oldest one is older than 30 minutes, once per backlog: ageing_alerted_at
-- marks the warning and the heartbeat clears it when the outbox empties.
-- pos_devices already grants app_user update (0076); no new grant.
-- ============================================================================

alter table pos_devices add column if not exists ageing_alerted_at timestamptz;

insert into scheduled_jobs (code, description, run_every, timeout_s, max_failures, priority) values
  ('pos.outbox_ageing', 'Warn owners when a till''s offline sales stop syncing', interval '10 minutes', 300, 5, 5)
on conflict (code) do nothing;
