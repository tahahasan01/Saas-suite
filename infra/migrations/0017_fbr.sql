-- ============================================================================
-- Migration 0017 — FBR Digital Invoicing (Pakistan)
--
-- Tier-1 retailers are legally required to transmit every sale to FBR in real
-- time and print the returned invoice number + QR on the customer's receipt.
-- Without this the retailer loses 40% of their input tax adjustment (100% ->
-- 60%) and risks penalties and premises sealing — so a POS that cannot do this
-- is unsellable to anyone in an AC mall, with a card machine, with an
-- electricity bill over Rs 1.2M/yr, or in a chain.
--
-- Contract: PRAL "Technical Documentation for DI API" v1.12.
-- ============================================================================

create table if not exists fbr_settings (
  tenant_id            uuid primary key references tenants(id) on delete cascade,
  enabled              boolean not null default false,
  environment          text not null default 'sandbox',   -- sandbox | production
  seller_ntn_cnic      text not null default '',          -- 7 or 13 digits
  seller_business_name text not null default '',
  seller_province      text not null default '',
  seller_address       text not null default '',
  -- Bearer token issued at e.fbr.gov.pk, valid 5 years. Secret: never returned
  -- by the API (see routers/fbr.py — the settings response omits it).
  token                text not null default '',
  -- Pakistani retail quotes tax-inclusive shelf prices; FBR wants the value
  -- excluding tax, so we have to know which way to compute.
  prices_include_tax   boolean not null default true,
  updated_at           timestamptz not null default now()
);

-- FBR requires an HS code, a tax rate and a UoM from its own reference list on
-- every line item. `unit` stays as the free-text shop-floor label.
alter table pos_products
  add column if not exists hs_code  text not null default '',
  add column if not exists tax_rate numeric(5,2) not null default 0,
  add column if not exists fbr_uom  text not null default 'Numbers, pieces, units';

alter table pos_sales
  add column if not exists tax_minor bigint not null default 0;

-- One submission record per sale. Kept separate from pos_sales so a failed
-- transmission can be retried without touching the sale itself.
create table if not exists pos_fbr_invoices (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  sale_id            uuid not null references pos_sales(id) on delete cascade,
  status             text not null default 'pending',  -- pending | submitted | failed
  fbr_invoice_number text,
  error_code         text not null default '',
  error              text not null default '',
  attempts           int not null default 0,
  last_attempt_at    timestamptz,
  created_at         timestamptz not null default now(),
  unique (sale_id)
);
create index if not exists pos_fbr_pending_idx
  on pos_fbr_invoices(tenant_id, status) where status <> 'submitted';

grant select, insert, update on fbr_settings to app_user;
grant select, insert, update on pos_fbr_invoices to app_user;

alter table fbr_settings enable row level security;
drop policy if exists tenant_isolation on fbr_settings;
create policy tenant_isolation on fbr_settings
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table pos_fbr_invoices enable row level security;
drop policy if exists tenant_isolation on pos_fbr_invoices;
create policy tenant_isolation on pos_fbr_invoices
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
