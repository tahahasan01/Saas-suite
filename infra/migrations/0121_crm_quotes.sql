-- ============================================================================
-- Migration 0121 — Quotes the customer accepts online (wave D, C15; study 12 §3)
--
--  * crm_quotes: a frozen copy of a deal's lines and totals, numbered from the
--    'crm.quote' sequence. Making a quote sends it: it gets its link at once.
--    A newer quote for the same deal supersedes the open one and kills its
--    link; a sent quote is never edited.
--  * Status: sent -> accepted | declined, or superseded / cancelled. "Expired"
--    is not stored: it is a sent quote past valid_until (the business date),
--    so no job has to flip it on time.
--  * The link: 32 random bytes. Only sha256 is used to find it (token_hash);
--    a copy encrypted under BOS_DATA_KEYS (token_enc, app/crypto.py) lets the
--    rep copy the same link again. Neither is ever returned to the public.
--  * content_hash: sha256 of the canonical quote content. The page sends back
--    the hash it showed, and acceptance stores it as evidence with the typed
--    name, time, IP and user agent.
--  * Views are counted by a POST from the page, never by the GET a WhatsApp
--    or email link preview makes.
--  * audit_log.actor_kind gains 'public': someone acting through a public
--    link (a customer accepting a quote; later, a web form).
-- ============================================================================

create table crm_quotes (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  lead_id             uuid not null references crm_leads(id) on delete cascade,
  number              text not null,
  status              text not null default 'sent',
  valid_until         date not null,
  terms               text not null default '' check (length(terms) <= 4000),
  customer_name       text not null default '' check (length(customer_name) <= 300),
  tax_inclusive       boolean not null default false,
  subtotal_minor      bigint not null,
  line_discount_minor bigint not null,
  net_minor           bigint not null,
  tax_minor           bigint not null,
  total_minor         bigint not null check (total_minor >= 0),
  content_hash        text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  token_hash          text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_enc           bytea not null,
  created_by          uuid references users(id) on delete set null,
  created_at          timestamptz not null default now(),
  first_viewed_at     timestamptz,
  view_count          int not null default 0,
  accepted_at         timestamptz,
  accepted_name       text check (length(accepted_name) <= 120),
  accepted_ip         text,
  accepted_user_agent text check (length(accepted_user_agent) <= 400),
  accepted_hash       text,
  declined_at         timestamptz,
  decline_reason      text check (length(decline_reason) <= 1000),
  closed_at           timestamptz,           -- superseded or cancelled
  invoice_id          uuid references invoices(id) on delete set null,
  updated_at          timestamptz not null default now(),
  constraint crm_quotes_status_check
    check (status in ('sent', 'accepted', 'declined', 'superseded', 'cancelled')),
  constraint crm_quotes_accepted_check
    check ((status = 'accepted') = (accepted_at is not null)),
  unique (tenant_id, id),
  unique (tenant_id, number)
);
create index crm_quotes_lead_idx on crm_quotes (lead_id, created_at desc);
create index crm_quotes_invoice_idx on crm_quotes (invoice_id) where invoice_id is not null;

create table crm_quote_lines (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  quote_id            uuid not null,
  position            int not null check (position >= 0),
  product_id          uuid references pos_products(id) on delete set null,
  description         text not null,
  unit                text not null default '',
  qty                 numeric(12,3) not null check (qty > 0),
  unit_price_minor    bigint not null,
  line_discount_minor bigint not null default 0,
  tax_code            text,
  tax_rate_pct        numeric(7,4) not null default 0,
  gross_minor         bigint not null,
  net_excl_minor      bigint not null,
  tax_minor           bigint not null,
  total_minor         bigint not null,
  foreign key (tenant_id, quote_id) references crm_quotes (tenant_id, id) on delete cascade,
  unique (quote_id, position)
);

-- A quote's lines are written once, with the quote; its row changes status only.
grant select, insert, update on crm_quotes to app_user;
grant select, insert on crm_quote_lines to app_user;

do $$
declare t text;
begin
  foreach t in array array['crm_quotes', 'crm_quote_lines'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;

-- ── Sent means frozen ───────────────────────────────────────────────────────
-- What the customer saw and accepted can't change, even for code that forgets.
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
        or new.accepted_hash is distinct from old.accepted_hash) then
    raise exception 'quote % was sent: its content and acceptance are frozen', old.id using errcode = 'P0001';
  end if;
  return new;
end$$;
create trigger crm_quotes_freeze before update on crm_quotes
  for each row execute function crm_quotes_freeze();

create or replace function crm_quote_lines_freeze() returns trigger language plpgsql as $$
begin
  -- Lines go in with their quote, in the same transaction, and never later.
  if exists (select 1 from crm_quotes q where q.id = new.quote_id
              and q.created_at < transaction_timestamp()) then
    raise exception 'quote % was sent: its lines are frozen', new.quote_id using errcode = 'P0001';
  end if;
  return new;
end$$;
create trigger crm_quote_lines_freeze before insert on crm_quote_lines
  for each row execute function crm_quote_lines_freeze();

create trigger audit after insert or update or delete on crm_quotes for each row
  execute function audit_row('lead_id','number','status','valid_until','total_minor','accepted_name',
                             'declined_at','invoice_id');

-- ── Who acted ───────────────────────────────────────────────────────────────
alter table audit_log drop constraint audit_log_actor_kind_check;
alter table audit_log add constraint audit_log_actor_kind_check
  check (actor_kind in ('user','job','ai','import','system','platform_admin','webhook','device','public'));
