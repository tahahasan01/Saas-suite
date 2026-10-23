-- ============================================================================
-- Migration 0131 — A drawn signature on online quotes (wave D leftovers)
--
--  * crm_quotes.accepted_signature: the PNG the customer drew when accepting
--    (checked by the API: a real PNG, small, sane dimensions). It is part of
--    the acceptance evidence, so the freeze trigger now keeps it too.
--  * crm_settings.quote_require_signature: a business can require one
--    (default: a typed name is enough).
-- ============================================================================

alter table crm_quotes
  add column accepted_signature bytea check (octet_length(accepted_signature) <= 200000);

alter table crm_settings
  add column quote_require_signature boolean not null default false;

create or replace function crm_quotes_freeze() returns trigger language plpgsql as $$
begin
  if new.number is distinct from old.number
     or new.lead_id is distinct from old.lead_id
     or new.valid_until is distinct from old.valid_until
     or new.terms is distinct from old.terms
     or new.customer_name is distinct from old.customer_name
     or new.tax_inclusive is distinct from old.tax_inclusive
     or new.subtotal_minor is distinct from old.subtotal_minor
     or new.line_discount_minor is distinct from old.line_discount_minor
     or new.net_minor is distinct from old.net_minor
     or new.tax_minor is distinct from old.tax_minor
     or new.total_minor is distinct from old.total_minor
     or new.content_hash is distinct from old.content_hash
     or new.token_hash is distinct from old.token_hash
     or new.token_enc is distinct from old.token_enc
     -- the acceptance evidence is written once
     or old.accepted_at is not null and (new.accepted_at is distinct from old.accepted_at
        or new.accepted_name is distinct from old.accepted_name
        or new.accepted_hash is distinct from old.accepted_hash
        or new.accepted_signature is distinct from old.accepted_signature) then
    raise exception 'quote % was sent: its content and acceptance are frozen', old.id using errcode = 'P0001';
  end if;
  return new;
end$$;
