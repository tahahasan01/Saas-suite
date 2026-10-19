-- ============================================================================
-- Migration 0025 — Grant lockdown for platform secret tables (audit P0-1)
--
-- 0001 set `alter default privileges ... grant select, insert, update, delete
-- on tables to app_user`, so every table created later — including
-- auth_tokens (raw reset/invite tokens for every tenant, no RLS) — was readable
-- by the runtime role. Combined with the AI SQL guard's blind spots that was a
-- cross-tenant account-takeover path.
--
-- These tables are not tenant-scoped, so RLS cannot protect them: the runtime
-- role must simply hold no privilege on them. All legitimate access goes
-- through the owner connection (deps.current_auth, tokens.py, auth router,
-- scripts/migrate.py).
-- ============================================================================

revoke all on table auth_tokens       from app_user;
revoke all on table sessions          from app_user;
revoke all on table schema_migrations from app_user;
