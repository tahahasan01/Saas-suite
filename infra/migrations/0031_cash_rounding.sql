-- ============================================================================
-- Migration 0031 — Cash rounding
--
-- Tax-exclusive prices produce paisa (Rs 80 + 18% = Rs 94.40) that a cash
-- till can't collect. For cash payments the amount due is rounded half-up to
-- tenants.cash_rounding_minor (default 100 = Rs 1; 0 switches it off) and the
-- difference is kept on the sale as rounding_minor. total_minor stays the
-- exact invoice value, which is what FBR is told; card and wallet payments are
-- never rounded.
-- ============================================================================

alter table tenants
  add column if not exists cash_rounding_minor int not null default 100
    check (cash_rounding_minor >= 0);

alter table pos_sales
  add column if not exists rounding_minor bigint not null default 0;
