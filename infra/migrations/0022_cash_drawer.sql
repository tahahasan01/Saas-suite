-- ============================================================================
-- Migration 0022 — Cash drawer sessions (shift reconciliation)
--
-- Every shop counts the till at close. The reconciliation number that matters
-- is the variance: what the cashier counted minus what the system says should
-- be there (opening float + cash sales − cash refunds). Card/wallet payments
-- never sit in the drawer, so they are reported but not expected.
--
-- expected/counted are recorded at close and never recomputed: the figures are
-- the shift's evidence, and a later edit to a sale must not silently rewrite a
-- reconciliation someone already signed off.
-- ============================================================================

create table if not exists pos_drawers (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id) on delete cascade,
  opened_by            uuid references users(id) on delete set null,
  opened_at            timestamptz not null default now(),
  opening_float_minor  bigint not null default 0,
  closed_by            uuid references users(id) on delete set null,
  closed_at            timestamptz,
  expected_minor       bigint,          -- computed and frozen at close
  counted_minor        bigint,          -- what the cashier actually counted
  notes                text not null default '',
  status               text not null default 'open'   -- open | closed
);

-- One till, one open drawer.
create unique index if not exists pos_drawers_one_open
  on pos_drawers(tenant_id) where status = 'open';
create index if not exists pos_drawers_history_idx on pos_drawers(tenant_id, opened_at desc);

grant select, insert, update on pos_drawers to app_user;

alter table pos_drawers enable row level security;
drop policy if exists tenant_isolation on pos_drawers;
create policy tenant_isolation on pos_drawers
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
