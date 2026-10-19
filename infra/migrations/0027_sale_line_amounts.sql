-- ============================================================================
-- Migration 0027 — What each sale line actually cost the customer (audit P0-5)
--
-- A sale stored only the line's list total; the discount and the tax lived on
-- the sale header. So FBR was told a pre-discount value, exclusive-tax sales
-- never charged the tax, and a refund paid back the list price — more than the
-- customer paid whenever there was a discount.
--
-- Each line now records its share of the discount, its tax and the amount
-- paid for it (app/pricing.py). Existing lines had no discount split and their
-- recorded total was what was charged, so they backfill as discount 0,
-- tax 0, total = line_total_minor.
-- ============================================================================

alter table pos_sale_items
  add column if not exists discount_minor bigint not null default 0,
  add column if not exists tax_minor      bigint not null default 0,
  add column if not exists total_minor    bigint;

update pos_sale_items set total_minor = line_total_minor where total_minor is null;
alter table pos_sale_items alter column total_minor set not null;
