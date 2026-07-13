-- ============================================================================
-- Migration 0005 — In-app notifications (tenant-scoped, RLS)
-- The delivery target for workflow actions and proactive alerts. External
-- channels (WhatsApp/email) plug in behind the same create path later.
-- ============================================================================

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  title      text not null,
  body       text not null default '',
  kind       text not null default 'info',   -- info | success | warning | alert
  link       text,                             -- optional in-app path, e.g. /crm
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications(tenant_id, user_id, read, created_at desc);

grant select, insert, update on notifications to app_user;
alter table notifications enable row level security;
create policy tenant_isolation on notifications
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
