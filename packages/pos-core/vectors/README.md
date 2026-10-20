# Pricing spec (D-21)

One pricing spec for the till, the receipt, the FBR invoice and every refund. The Python
implementation is `services/api/app/pricing.py` (Phase 1); the TypeScript one will live in
`packages/pos-core` (Phase 3, F18). Both must pass every vector in `pricing.json` in this
folder, and both run it in CI.

Source: studies/01 §6.7, decisions D-21 and D-09, audit P0-5, checklist §1D and §6.1.
(This spec lives here rather than in `docs/specs/pricing.md` because `*.md` other than
`README.md` is kept out of the repository.)

## 1. Units and rounding

- Every amount is an **integer number of minor units** (paisa). No floats touch money.
  Quantities and tax rates are decimals (`qty` up to 3 places, `tax_rate_pct` up to 2).
- Every rounding step is **half-up** (0.5 goes away from zero): `round(2.5) = 3`,
  `round(450.54) = 451`. Implementations must not use banker's rounding (Python's built-in
  `round`, `Number.prototype.toFixed` quirks) for money.
- Quantities are converted from their decimal text, never from a binary float
  (`Decimal("0.1")`, not `Decimal(0.1)`).

## 2. Order of operations

Per line `i` with unit price `p`, quantity `q`, tax rate `r` (percent) and line discount `d`:

1. `gross = round(p × q)`
2. `line_discount = min(max(d, 0), gross)` — a line discount can never make a line negative.
3. `line_net = gross − line_discount`
4. The **order discount** `D` is capped at `Σ line_net` and spread over the lines **pro rata to
   `line_net`** with the largest-remainder method (§3). This line's part is `share`.
5. `net = line_net − share`
6. Tax, when tax is on for the sale and `r > 0`:
   - **tax-inclusive** prices: `excl = round(net / (1 + r/100))`, `tax = net − excl`
   - **tax-exclusive** prices: `excl = net`, `tax = round(excl × r/100)`
   - otherwise `excl = net`, `tax = 0`.
7. `incl = excl + tax` — what the customer pays for the line.

Sale figures: `subtotal = Σ gross`, `tax = Σ tax`, **`total = Σ incl`**. FBR's per-line
`discount` is `line_discount + share`, `valueSalesExcludingST` is `excl`, `salesTaxApplicable`
is `tax`, `totalValues` is `incl`.

Tax is "on" only while FBR invoicing is enabled for the tenant; the inclusive/exclusive flag is
the tenant's `prices_include_tax`. Both are snapshotted onto each sale line at sale time
(migration 0034), with the rate that actually applied (0 when tax was off).

## 3. Largest-remainder allocation and the tie-break

To split `A` over weights `w₁…wₙ` (total `W`):

1. `partᵢ = floor(A × wᵢ / W)` and `remᵢ = (A × wᵢ) mod W`, in **integer arithmetic**.
2. `A − Σ partᵢ` paisa are left over. Give one each to the lines with the largest `remᵢ`.
3. **Ties go to the lowest line index.** Remainders are compared exactly as integers; a decimal
   division must not be used to compare them, because its precision depends on the size of the
   quotient and can order two mathematically equal remainders the wrong way (vector PV-12).

If `A ≤ 0` or `W = 0`, every part is 0. Parts always sum to exactly `A`, and each part is
`floor(A × wᵢ / W)` or one more.

## 4. Cash rounding

Applied after pricing, only when the tender is **cash** and the tenant's `cash_rounding_minor`
unit is above 0: `due = round_half_up(total / unit) × unit` and `rounding = due − total`
(may be negative). Card, wallet and bank tenders pay `total` exactly. The invoice total, and
what FBR is told, is always `total`; `rounding` is stored on the sale. Split tender (rounding
only the cash part) arrives with D-24 in Phase 3.

## 5. Refunds

A refund pays back what the customer paid, never list price: the line's stored `incl`.

**Cumulative rounding.** For a line that sold `n` units with stored `incl = T`, after a return
that brings the units returned so far from `k₀` to `k₁`:

- if `k₁ = n`: refund `T − refunded_so_far` (the last return lands exactly on what was paid);
- otherwise: refund `round_half_up(T × k₁ / n) − refunded_so_far`, clamped to
  `[0, T − refunded_so_far]`.

So after any returns totalling `k` units the line has refunded `round(T × k / n)` however the `k`
were split across visits, the parts never run ahead of the line, every part is within one paisa
of its pro-rata share, and the sum of all refunds can never exceed `T`. On top of the per-line
rule, the server caps a return at what is left of the sale's cash-rounded amount paid, and
returns run under `select … for update` on the sale.

## 6. Test vectors

`pricing.json` holds the vectors. Each `sale` vector gives its inputs and **every** intermediate
value per line (`gross_minor`, `line_discount_minor`, `line_net_minor`, `discount_share_minor`,
`net_minor`, `excl_minor`, `tax_minor`, `incl_minor`) plus the sale figures
(`subtotal_minor`, `line_discount_minor`, `order_discount_minor`, `tax_minor`, `total_minor`,
`rounding_minor`, `amount_due_minor`). Each `refund` vector gives a line's `incl`, units sold
and a sequence of returns, and the expected refund for each.

| ID | Case |
|----|------|
| PV-01 | Tax-exclusive total (the P0-5 regression) |
| PV-02 | Tax-inclusive |
| PV-03 | Order discount pro rata before tax |
| PV-04 | Largest-remainder tie-break, equal lines |
| PV-05 | Line discount capped at gross |
| PV-06 / 07 | Cash rounding on cash, skipped on card |
| PV-08 | Partial refunds never exceed what was paid |
| PV-09 | A refund honours the order discount |
| PV-10 | Mixed rates, exempt line |
| PV-11 | Half-up tax rounding |
| PV-12 | Tie-break across lines of different value (exact integer remainders) |
| PV-13 | Tax-inclusive with an order discount |
| PV-14 | Half-up gross on a fractional quantity |
| PV-15 | Order discount capped at the cart |
| PV-16 | Tax off |
| PV-17 | Cumulative refund rounding, many small returns |
| PV-18 | Refund in uneven parts |
| PV-19 / 20 | Cash rounding down; cash rounding off |
| PV-21 | Line discount, then order discount pro rata to what is left |

Property tests (`services/api/tests/pos/test_pricing_properties.py`, Hypothesis; fast-check in
Phase 3) hold the invariants on random carts of up to 50 lines: shares sum exactly to the order
discount, total = Σ incl, no negative amount, inclusive/exclusive round-trip within 1 paisa per
line, refunds never exceed what was paid, cash rounding within half a unit and idempotent.

**Change control.** Changing or removing a vector needs approval from the engineering lead and
whoever owns money correctness, plus a release note (checklist §6.1). Adding a vector does not.
