-- ============================================================================
-- Migration 0090 — The touch tile screen (wave B, P42)
--
--  * pos_categories.color, pos_products.color: a tile colour from a fixed
--    palette the web maps to tints that stay readable in light and dark. A
--    product without its own colour shows its category's. Null = plain.
--  * pos_products.pinned: on the till's favourites page.
--  Product changes already bump row_version (0081), so tills pick these up in
--  the next catalogue delta; categories travel whole with every delta.
-- ============================================================================

alter table pos_categories add column color text;
alter table pos_categories add constraint pos_categories_color_check
  check (color is null or color in ('red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple',
                                    'pink', 'slate'));

alter table pos_products add column color text, add column pinned boolean not null default false;
alter table pos_products add constraint pos_products_color_check
  check (color is null or color in ('red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple',
                                    'pink', 'slate'));
create index pos_products_pinned_idx on pos_products (tenant_id) where pinned;
