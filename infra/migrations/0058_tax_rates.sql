-- ============================================================================
-- Migration 0058 — Effective-dated sales-tax rates and tax categories (D-10, 3A)
--
-- Platform-owned reference data (global: no tenant_id, no RLS, select-only
-- for app_user, written only by migrations), like the salary slabs.
--
--  * tax_rates       one row per (code, region, period). rate_pct is a
--                    percentage (18.0000 = 18%). Withholding (kind 'wht')
--                    is stored positive; the document subtracts it.
--                    effective_to is exclusive; an exclusion constraint
--                    refuses two rows of one code and region whose periods
--                    overlap. region_code null = national.
--  * tax_categories  what a product or service is (standard, exempt, …) ->
--                    the rate codes that apply. Products get a category in
--                    Wave 2 (POS / invoices v2).
--
-- EVERY seeded rate is verified = false: they were written from public
-- summaries, not checked against the Gazette / provincial notifications.
-- The UI warns while an unverified rate is in force. Flipping a rate to
-- verified = true is a new migration that cites the notification.
-- Never imported from Odoo's l10n_pk (its GST is still 17%).
-- ============================================================================

create extension if not exists btree_gist;

create table if not exists tax_rates (
  id                uuid primary key default gen_random_uuid(),
  code              text not null check (code ~ '^[a-z0-9_]+$'),
  kind              text not null check (kind in ('gst', 'pst', 'further', 'extra', 'fed', 'wht')),
  name              text not null,
  region_code       text references pk_regions(code),
  rate_pct          numeric(7, 4) not null check (rate_pct between 0 and 100),
  applies_to        text not null check (applies_to in ('sale', 'purchase', 'both')),
  included_in_price boolean,            -- null = follow the tenant's prices-include-tax setting
  fbr_sale_type     text,               -- PRAL saleType, mapped in Wave 2
  effective_from    date not null,
  effective_to      date,               -- exclusive; null = open-ended
  verified          boolean not null default false,
  source_ref        text not null check (length(btrim(source_ref)) > 0),
  constraint tax_rates_period_check check (effective_to is null or effective_to > effective_from),
  constraint tax_rates_no_overlap exclude using gist (
    code with =, (coalesce(region_code, '')) with =, daterange(effective_from, effective_to) with &&)
);

create table if not exists tax_categories (
  code        text primary key check (code ~ '^[a-z_]+$'),
  name        text not null,
  description text not null default '',
  rate_codes  text[] not null default '{}',
  sort        smallint not null default 0
);

grant select on tax_rates      to app_user;
grant select on tax_categories to app_user;

-- ── Seeds (all unverified; see header) ──────────────────────────────────────
insert into tax_rates (code, kind, name, region_code, rate_pct, applies_to, included_in_price,
                       effective_from, source_ref) values
  ('gst_standard', 'gst', 'Sales tax (standard)', null, 18, 'both', null, '2023-07-01',
   'Sales Tax Act 1990 s.3(1); 18% standard rate (Finance (Supplementary) Act 2023). Verify against the Gazette.'),
  ('gst_zero', 'gst', 'Sales tax (zero-rated)', null, 0, 'both', null, '2023-07-01',
   'Sales Tax Act 1990 s.4 and Fifth Schedule. Verify which items qualify.'),
  ('further_tax', 'further', 'Further tax (unregistered buyer)', null, 4, 'sale', false, '2023-07-01',
   'Sales Tax Act 1990 s.3(1A): further tax on supplies to unregistered persons. Verify the current rate.'),
  ('pst_services', 'pst', 'Punjab sales tax on services', 'PB', 16, 'sale', null, '2023-07-01',
   'Punjab Sales Tax on Services Act 2012 (PRA), standard rate. Verify against the PRA notification.'),
  ('pst_services', 'pst', 'Sindh sales tax on services', 'SD', 15, 'sale', null, '2024-07-01',
   'Sindh Sales Tax on Services Act 2011 (SRB), standard rate per Sindh Finance Act 2024. Verify.'),
  ('pst_services', 'pst', 'KP sales tax on services', 'KP', 15, 'sale', null, '2023-07-01',
   'KP Finance Act 2013, sales tax on services (KPRA), standard rate. Verify.'),
  ('pst_services', 'pst', 'Balochistan sales tax on services', 'BA', 15, 'sale', null, '2023-07-01',
   'Balochistan Sales Tax on Services Act 2015 (BRA), standard rate. Verify.'),
  ('pst_services', 'pst', 'Islamabad sales tax on services', 'ICT', 16, 'sale', null, '2023-07-01',
   'Islamabad Capital Territory (Tax on Services) Ordinance 2001, standard rate. Verify.'),
  ('wht_236g', 'wht', 'Advance tax on sales to distributors/wholesalers (236G)', null, 0.1, 'sale', false,
   '2023-07-01', 'Income Tax Ordinance 2001 s.236G, rate for persons on the Active Taxpayers List. Verify.'),
  ('wht_236h', 'wht', 'Advance tax on sales to retailers (236H)', null, 0.5, 'sale', false, '2023-07-01',
   'Income Tax Ordinance 2001 s.236H, rate for persons on the Active Taxpayers List. Verify.'),
  ('wht_153_goods', 'wht', 'Withholding on supply of goods (153(1)(a), company)', null, 5, 'purchase', false,
   '2024-07-01', 'Income Tax Ordinance 2001 s.153(1)(a), Division III Part III First Schedule, companies. Verify.')
on conflict do nothing;

insert into tax_categories (code, name, description, rate_codes, sort) values
  ('standard',    'Standard goods',          'Goods taxed at the standard sales tax rate',         '{gst_standard}', 1),
  ('zero_rated',  'Zero-rated goods',        'Fifth Schedule goods: taxable at 0%',                 '{gst_zero}', 2),
  ('exempt',      'Exempt',                  'Sixth Schedule goods and services: no sales tax',     '{}', 3),
  ('services',    'Services',                'Services taxed by the province where they are given', '{pst_services}', 4),
  ('unregistered_buyer', 'Sale to an unregistered buyer', 'Standard rate plus further tax',       '{gst_standard,further_tax}', 5)
on conflict (code) do nothing;
