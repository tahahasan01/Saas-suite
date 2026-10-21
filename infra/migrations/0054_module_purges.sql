-- ============================================================================
-- Migration 0054 — Delayed module purge (D-02, St04 risk 6)
--
-- Disabling a module never deletes anything. Deleting a disabled module's
-- data is a separate request: the Owner types a confirmation, a row lands
-- here with run_after = now() + 7 days, and the worker's `modules.purge` job
-- carries it out once due — only if the module is still disabled. Turning the
-- module back on cancels the pending purge. One pending purge per module.
-- ============================================================================

create table if not exists module_purges (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  module_key   text not null,
  status       text not null default 'pending' check (status in ('pending', 'cancelled', 'done', 'failed')),
  requested_by uuid references users(id) on delete set null,
  requested_at timestamptz not null default now(),
  run_after    timestamptz not null,
  finished_at  timestamptz,
  result       jsonb not null default '{}'::jsonb,
  error        text not null default ''
);
create unique index if not exists module_purges_one_pending
  on module_purges (tenant_id, module_key) where status = 'pending';
create index if not exists module_purges_due on module_purges (run_after) where status = 'pending';

-- Requested and cancelled under tenant_conn; carried out by the worker (owner).
grant select, insert, update on module_purges to app_user;

alter table module_purges enable row level security;
drop policy if exists tenant_isolation on module_purges;
create policy tenant_isolation on module_purges
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

insert into scheduled_jobs (code, description, run_every, timeout_s, max_failures, priority) values
  ('modules.purge', 'Delete the data of disabled modules whose purge delay has passed', interval '1 hour', 1800, 5, 9)
on conflict (code) do nothing;
