-- ============================================================================
-- Migration 0049 — Audit the encrypted FBR token (integration of 0044 + 0046)
--
-- 0044 audits fbr_settings with '!token' (changed, value masked). 0046 moved
-- the token into token_enc and keeps `token` always '', so a token change
-- would no longer show up in the trail at all. The trigger now also tracks
-- '!token_enc': the change is recorded as ["***","***"] and named in
-- `guarded`; neither the plaintext nor the ciphertext is copied.
-- ============================================================================

drop trigger if exists audit on fbr_settings;
create trigger audit after insert or update or delete on fbr_settings for each row
  execute function audit_row('enabled','environment','seller_ntn_cnic','seller_business_name',
                             'seller_province','seller_address','prices_include_tax','!token',
                             '!token_enc');
