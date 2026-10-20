-- ============================================================================
-- Migration 0043 — Worker jobs (decision D-08; checklist 2B; gate I6)
--
-- The API process no longer runs a scheduler. A dedicated worker
-- (`python -m app.worker`, app/jobs.py) runs every periodic job from here:
--
--   scheduled_jobs  one row per job. A worker claims a due row in its own
--                   committed statement (`for update skip locked`, status ->
--                   running, locked_until = now() + timeout_s) before running
--                   it, so two workers can never run the same job.
--                   failure_count counts consecutive failures; at
--                   max_failures the job is switched off (active = false,
--                   disabled_reason) and an alert is raised. A row still
--                   `running` past locked_until belonged to a worker that
--                   died: the reaper puts it back and counts a failure.
--   job_triggers    "run this job now" requests (ops, or a job asking for a
--                   follow-up pass); consumed when the job is claimed.
--   job_runs        one row per run: who, when, outcome, error. Pruned after
--                   90 days by ops.prune (12-trd TR-NFR-15).
--
-- Platform-owned: no tenant_id, no RLS, and NO privileges for app_user. Only
-- the owner (worker) connection touches these tables.
-- ============================================================================

create table if not exists scheduled_jobs (
  code             text primary key check (code ~ '^[a-z]+\.[a-z_]+$'),
  description      text not null default '',
  run_every        interval not null check (run_every > interval '0'),
  next_run_at      timestamptz not null default now(),
  last_run_at      timestamptz,
  last_success_at  timestamptz,
  active           boolean not null default true,
  priority         smallint not null default 5,
  status           text not null default 'idle' check (status in ('idle', 'running')),
  locked_until     timestamptz,
  current_run_id   bigint,
  worker           text not null default '',
  timeout_s        int not null default 300 check (timeout_s > 0),
  failure_count    int not null default 0 check (failure_count >= 0),
  first_failure_at timestamptz,
  max_failures     int not null default 5 check (max_failures > 0),
  disabled_reason  text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists scheduled_jobs_due on scheduled_jobs (next_run_at) where active and status = 'idle';

create table if not exists job_triggers (
  id         bigint generated always as identity primary key,
  job_code   text not null references scheduled_jobs(code) on delete cascade,
  run_at     timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists job_triggers_job on job_triggers (job_code, run_at);

create table if not exists job_runs (
  id          bigint generated always as identity primary key,
  job_code    text not null references scheduled_jobs(code) on delete cascade,
  worker      text not null default '',
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running' check (status in ('running', 'done', 'failed', 'timeout')),
  result      jsonb,
  error       text not null default ''
);
create index if not exists job_runs_job on job_runs (job_code, started_at desc);
create index if not exists job_runs_started on job_runs (started_at);

revoke all on scheduled_jobs, job_triggers, job_runs from app_user;
revoke all on scheduled_jobs, job_triggers, job_runs from public;

-- ── The jobs (handlers in app/jobs.py HANDLERS; a test keeps the two in step)
insert into scheduled_jobs (code, description, run_every, timeout_s, max_failures, priority) values
  -- The FBR outbox: filings that did not land at the till, abandoned sends,
  -- unknown rows to reconcile. Per-row back-off lives on the outbox rows; a
  -- failure here means the whole pass broke, so it is allowed many retries
  -- before it switches itself off (and alerts).
  ('fbr.outbox',             'File queued sales and returns with FBR',  interval '1 minute',  900, 30, 1),
  ('email.outbox',           'Send queued transactional email',         interval '15 seconds', 300, 30, 2),
  ('crm.followup_reminders', 'Notify lead owners of due follow-ups',    interval '5 minutes', 300, 5,  5),
  ('pos.restock_alerts',     'Tell owners what is running out',         interval '1 day',     900, 5,  8),
  ('ops.monitor',            'Outbox lag and stale-job alerts',         interval '5 minutes', 120, 10, 3),
  ('ops.prune',              'Drop job runs older than 90 days',        interval '1 day',     300, 5,  9)
on conflict (code) do nothing;
