-- ============================================================================
-- Migration 0110 — Reminders for unacknowledged policies (wave A leftover, H19)
--
-- hrms_notices gains last_reminded_at and reminders_sent. HR reminds by hand
-- (not twice in 12 hours); the daily job hrms.policy_reminders reminds once
-- a week while anyone is still to acknowledge, at most four times in all.
-- ============================================================================

alter table hrms_notices
  add column if not exists last_reminded_at timestamptz,
  add column if not exists reminders_sent   int not null default 0 check (reminders_sent >= 0);

insert into scheduled_jobs (code, description, run_every, timeout_s, max_failures, priority) values
  ('hrms.policy_reminders', 'Remind staff of policies they have not acknowledged', interval '1 day', 600, 5, 8)
on conflict (code) do nothing;
