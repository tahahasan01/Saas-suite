-- ============================================================================
-- Migration 0014 — Auth tokens (password reset · email verification · invites)
-- System table: created and consumed during flows that have no tenant session,
-- so it's accessed via the owner role only (like sessions) — no app_user grant,
-- no RLS. Tokens are opaque random secrets with an expiry.
-- ============================================================================

alter table users add column if not exists email_verified boolean not null default false;

create table if not exists auth_tokens (
  token       text primary key,
  kind        text not null,                    -- reset | verify | invite
  user_id     uuid references users(id) on delete cascade,
  tenant_id   uuid references tenants(id) on delete cascade,
  role_id     uuid references roles(id) on delete set null,
  email       text not null default '',
  name        text not null default '',
  expires_at  timestamptz not null,
  used        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists auth_tokens_email_kind_idx on auth_tokens(email, kind) where not used;
