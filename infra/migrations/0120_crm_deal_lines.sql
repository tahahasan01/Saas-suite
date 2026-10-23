-- ============================================================================
-- Migration 0120 — Products and line items on deals (wave D, C14; study 12 §2)
--
--  * crm_deal_lines: what the customer is being offered. A line is a catalog
--    product (its name, unit and price snapshotted, so a later catalog change
--    never moves an open deal) or free text. Amounts come from the one
--    pricing function (app/pricing.py, D-21); the tax code, rate and rate id
--    are snapshotted like invoice lines. Lines are replaced wholesale.
--  * list_price_minor is the catalog price when the line was priced;
--    price_overridden marks a hand-typed price, which "update prices" leaves
--    alone (study 12: protected manual prices).
--  * crm_leads gains the totals of its lines. While a deal has lines its
--    value_minor is their pre-tax total (a tax change doesn't move the
--    pipeline) and can't be typed; without lines it stays a typed estimate.
--  * crm_settings: one row per tenant for the selling defaults. Starts with
--    the largest line discount a rep may give; going over it needs
--    crm.deal.discount_override.
-- ============================================================================

create table crm_deal_lines (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  lead_id             uuid not null references crm_leads(id) on delete cascade,
  position            int not null check (position >= 0),
  product_id          uuid references pos_products(id) on delete set null,
  description         text not null check (length(btrim(description)) between 1 and 300),
  unit                text not null default '' check (length(unit) <= 20),
  qty                 numeric(12,3) not null check (qty > 0),
  unit_price_minor    bigint not null check (unit_price_minor >= 0),
  list_price_minor    bigint check (list_price_minor >= 0),
  price_overridden    boolean not null default false,
  line_discount_minor bigint not null default 0 check (line_discount_minor >= 0),
  tax_code            text,
  tax_rate_id         uuid references tax_rates(id),
  tax_rate_pct        numeric(7,4) not null default 0,
  gross_minor         bigint not null,
  net_excl_minor      bigint not null,
  tax_minor           bigint not null,
  total_minor         bigint not null,
  unique (lead_id, position)
);
create index crm_deal_lines_product_idx on crm_deal_lines (product_id) where product_id is not null;

alter table crm_leads
  add column line_count        int not null default 0 check (line_count >= 0),
  add column lines_tax_inclusive boolean not null default false,
  add column lines_tax_minor   bigint not null default 0,
  add column lines_total_minor bigint not null default 0;

create table crm_settings (
  tenant_id         uuid primary key references tenants(id) on delete cascade,
  -- null: no ceiling.
  max_discount_pct  numeric(5,2) check (max_discount_pct between 0 and 100),
  updated_at        timestamptz not null default now()
);

-- Lines are replaced wholesale (delete + insert), never updated in place.
grant select, insert, delete on crm_deal_lines to app_user;
grant select, insert, update on crm_settings to app_user;

do $$
declare t text;
begin
  foreach t in array array['crm_deal_lines', 'crm_settings'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  end loop;
end$$;
