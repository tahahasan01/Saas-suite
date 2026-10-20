-- ============================================================================
-- Migration 0034 — Sale line snapshots (checklist 1D, 7.4; audit P0-5)
--
-- The FBR retry and the debit note read HS code, UoM and tax rate from the
-- *current* product, so editing a product after a sale changed what was filed
-- for it, and a refund's tax used today's rate. Each sale line now records
-- what FBR needs as it was at the moment of sale:
--
--   hs_code, fbr_uom  — the product's FBR classification
--   tax_rate          — the rate that actually applied (0 when tax was off)
--   tax_inclusive     — whether the price included the tax
--   excl_minor        — value excluding sales tax (total_minor - tax_minor)
--   snapshot_source   — 'sale' (recorded at checkout) | 'legacy' (backfilled)
--
-- discount_minor, tax_minor and total_minor (0027) are the line's discount,
-- tax and incl amounts, so they are not duplicated here.
--
-- Backfill (best effort, marked 'legacy'): sales recorded before this
-- migration take hs_code, fbr_uom and tax_rate from the product as it is now,
-- and tax_inclusive from the tenant's current FBR setting, because nothing
-- else recorded them (no FBR payload was stored). Amounts are not recomputed:
-- excl_minor is derived from the stored total and tax, and pos_sales totals
-- are untouched (receipts already given are the record). A line whose product
-- was deleted keeps an empty HS code, which FBR will reject; such a filing
-- needs manual review rather than a guess.
-- ============================================================================

alter table pos_sale_items
  add column if not exists hs_code         text not null default '',
  add column if not exists fbr_uom         text not null default 'Numbers, pieces, units',
  add column if not exists tax_rate        numeric(5,2) not null default 0,
  add column if not exists tax_inclusive   boolean not null default true,
  add column if not exists excl_minor      bigint,
  -- Every row that exists now is a backfill; the default flips to 'sale' below.
  add column if not exists snapshot_source text not null default 'legacy'
    check (snapshot_source in ('sale', 'legacy'));

update pos_sale_items i
   set hs_code  = coalesce(p.hs_code, ''),
       fbr_uom  = coalesce(p.fbr_uom, 'Numbers, pieces, units'),
       tax_rate = coalesce(p.tax_rate, 0)
  from pos_products p
 where p.id = i.product_id and i.snapshot_source = 'legacy';

update pos_sale_items i
   set tax_inclusive = s.prices_include_tax
  from fbr_settings s
 where s.tenant_id = i.tenant_id and i.snapshot_source = 'legacy';

update pos_sale_items set excl_minor = total_minor - tax_minor where excl_minor is null;

alter table pos_sale_items
  alter column excl_minor set not null,
  alter column snapshot_source set default 'sale';
