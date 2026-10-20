-- ============================================================================
-- Migration 0046 — Credentials encrypted at rest (S14, TR-SEC-50, §7.5)
--
-- The FBR bearer token moves from plaintext `token` to `token_enc`: an
-- envelope-encrypted blob (app/crypto.py) whose master key is in the
-- environment (BOS_DATA_KEYS), never in this database or its backups.
--
-- SQL cannot encrypt here — the key is deliberately out of its reach — so the
-- backfill is a script run once after this migration:
--     python -m scripts.encrypt_credentials
-- It encrypts every plaintext token, decrypts each one back to compare,
-- blanks `token`, then VALIDATEs the constraint below.
--
-- The constraint is added NOT VALID: from this migration on, no write can put
-- a plaintext token into the table, while rows from before it stay readable
-- until the backfill moves them. The `token` column itself is kept (always
-- '') for one release as the rollback path (`--rollback` decrypts back into
-- it); a later migration drops it once production has been verified.
--
-- Grants: fbr_settings keeps its table-level grant (0032), which covers the
-- new column. No new table.
-- ============================================================================

alter table fbr_settings add column if not exists token_enc bytea;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fbr_settings_token_not_plaintext') then
    alter table fbr_settings
      add constraint fbr_settings_token_not_plaintext check (token = '') not valid;
  end if;
end$$;

comment on column fbr_settings.token is
  'Deprecated (0046): always empty. The token lives encrypted in token_enc.';
comment on column fbr_settings.token_enc is
  'Envelope-encrypted FBR bearer token (app/crypto.py, AAD tenant_id|fbr_settings|token).';
