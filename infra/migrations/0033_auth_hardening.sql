-- ============================================================================
-- Migration 0033 — Auth hardening (decision D-05, audit P0-1/P0-2, gates S5/S6)
--
-- 1. auth_tokens keeps only sha256(token). A dump of the table used to be a
--    password reset for every account with a pending link. Raw tokens cannot
--    be hashed after the fact without keeping them, so EVERY OUTSTANDING
--    RESET, INVITE AND VERIFY LINK IS INVALIDATED at deploy: users must ask
--    for a new reset link, and owners must re-send pending invites (release
--    note, 12-trd §7.2).
-- 2. users.auth_epoch / sessions.auth_epoch. A session is valid only while
--    its epoch equals the user's (deps.current_auth). The trigger below bumps
--    the user's epoch on password change or reset, deactivation, and role
--    change or removal, so every session issued before the change dies on its
--    next request. Existing sessions start at 0 = 0 and stay valid.
-- 3. users.locale: the user's language choice, read by /auth/me (null = the
--    tenant default).
-- ============================================================================

-- ── 1. Hashed single-use tokens ─────────────────────────────────────────────
delete from auth_tokens;  -- see header: outstanding links cannot be carried over
alter table auth_tokens drop constraint auth_tokens_pkey;
alter table auth_tokens drop column token;
alter table auth_tokens
  add column token_hash text not null
    -- Only a sha256 hex digest fits, so a code path that forgets to hash
    -- fails loudly instead of quietly storing a live credential.
    check (token_hash ~ '^[0-9a-f]{64}$'),
  add primary key (token_hash);

-- ── 2. Session epochs ───────────────────────────────────────────────────────
alter table users    add column if not exists auth_epoch int not null default 0;
alter table sessions add column if not exists auth_epoch int not null default 0;

-- A trigger rather than one bump per endpoint: every path that changes a
-- password, status or role (reset, change, team admin, a support script)
-- revokes sessions, including paths written later.
create or replace function users_bump_auth_epoch() returns trigger
language plpgsql as $$
begin
  if new.password_hash is distinct from old.password_hash
     or new.status     is distinct from old.status
     or new.role_id    is distinct from old.role_id then
    new.auth_epoch := old.auth_epoch + 1;
  end if;
  return new;
end $$;

drop trigger if exists users_auth_epoch on users;
create trigger users_auth_epoch before update on users
  for each row execute function users_bump_auth_epoch();

-- ── 3. Per-user locale ──────────────────────────────────────────────────────
alter table users add column if not exists locale text check (locale in ('en', 'ur'));
