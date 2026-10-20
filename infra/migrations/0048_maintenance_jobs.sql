-- ============================================================================
-- Migration 0048 — Maintenance jobs for the worker (integration of 0043, 0044, 0045)
--
-- Handlers are in app/jobs.py HANDLERS (tests/core/test_worker.py keeps the
-- two in step):
--   audit.partitions         daily    audit.create_partitions(months_ahead=3):
--                                     this month and the next 3 exist before
--                                     rows arrive (TRD TR-SEC-62).
--   audit.retention          monthly  audit.apply_retention(): rows past each
--                                     tenant's plan window go (TR-NFR-15).
--   audit.detach             monthly  audit.detach_expired_partitions(84):
--                                     months past every window are detached
--                                     and named in the log. No archive bucket
--                                     is configured yet, so the detached
--                                     tables are kept in the database (not
--                                     dropped) for an operator to export and
--                                     drop (infra/audit/README.md).
--   hrms.finalise_open_days  hourly   attendance.finalise_open_days() in each
--                                     active tenant with HRMS on, so a day
--                                     nobody checked out of is judged once its
--                                     shift is over (D-43), not left "present".
-- ============================================================================

insert into scheduled_jobs (code, description, run_every, timeout_s, max_failures, priority) values
  ('audit.partitions',        'Create the coming months of the audit log',          interval '1 day',   300,  5, 7),
  ('audit.retention',         'Delete audit rows older than the plan keeps',        interval '1 month', 1800, 5, 9),
  ('audit.detach',            'Detach audit months older than every plan keeps',    interval '1 month', 600,  5, 9),
  ('hrms.finalise_open_days', 'Judge attendance days nobody checked out of',        interval '1 hour',  900,  5, 6)
on conflict (code) do nothing;
