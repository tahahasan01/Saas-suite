-- ============================================================================
-- Migration 0056 — Gap-free document numbers (D-06, gate M8, checklist §6.3)
--
--  * sequences          one numbering rule per (tenant, code, branch,
--                       register): pattern, padding, reset rule. Code is
--                       module.document ('sales.invoice', 'pos.receipt').
--                       null branch = tenant-wide, null register = branch-wide.
--  * sequence_counters  the next value per (sequence, period). period_key is
--                       '2026-27' (fiscal year, Jul–Jun by default),
--                       '2026' (calendar year), '2026-10' (month) or '-'.
--
-- Allocation (app/sequences.py next_number) is ONE upsert executed as the
-- last statement of the document's transaction. It row-locks the counter
-- until COMMIT, so concurrent documents queue and a rollback returns the
-- number. Per-register sequences keep tills off each other's row.
--
-- app_user may select/insert/update; never delete a counter (that would
-- reissue numbers). Moving `next_value` is forward-only in the API, audited.
-- ============================================================================

create table if not exists sequences (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  code        text not null check (code ~ '^[a-z_]+\.[a-z_]+$'),
  name        text not null default '',
  register_id uuid,                     -- POS registers arrive in Wave 2 (3C); no FK yet
  pattern     text not null check (pattern like '%{N}%' and length(pattern) <= 60),
  padding     smallint not null default 5 check (padding between 1 and 12),
  reset       text not null default 'fiscal_year'
              check (reset in ('never', 'fiscal_year', 'calendar_year', 'month')),
  gapless     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id)
);

-- branch_id (nullable, shared when null) + FK + restrictive branch policy.
call bos_branch_scope('sequences', false);

create unique index if not exists sequences_scope_uq
  on sequences (tenant_id, code, branch_id, register_id) nulls not distinct;

create table if not exists sequence_counters (
  tenant_id   uuid not null references tenants(id) on delete cascade,
  sequence_id uuid not null,
  period_key  text not null check (period_key ~ '^(-|\d{4}(-\d{2})?)$'),
  next_value  bigint not null check (next_value >= 1),
  updated_at  timestamptz not null default now(),
  primary key (sequence_id, period_key),
  foreign key (tenant_id, sequence_id) references sequences (tenant_id, id)
);

grant select, insert, update on sequences         to app_user;
grant select, insert, update on sequence_counters to app_user;   -- never delete

do $$
declare t text;
begin
  foreach t in array array['sequences', 'sequence_counters']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

create trigger audit after insert or update or delete on sequences for each row
  execute function audit_row('code', 'branch_id', 'register_id', 'pattern', 'padding', 'reset', 'gapless');
