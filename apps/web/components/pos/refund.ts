/* The Returns preview. Mirrors services/api/app/pricing.py `refund_for` and the
 * cap in `create_return`, fed by the figures the sale lookup now returns, so
 * the amount on screen is the amount the server will record — not list price
 * x qty, which ignored the discount and paid out more cash than was recorded
 * (audit I8). Keep the two in step; the rule is the pricing spec §5
 * (packages/pos-core/vectors/README.md, vectors PV-08, PV-17, PV-18). */

import type { RefundableLine } from "@business-os/types";

type Line = Pick<RefundableLine, "sale_item_id" | "qty_sold" | "qty_returned" | "paid_minor" | "refunded_minor">;

/** Half-up, as every money rounding in the spec (halves go up, not to even). */
function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5 + 1e-9);
}

/** Cumulative rounding: once k of n units are back, the line has refunded
 * round(paid x k / n) in total however the k were split, so small returns
 * never run ahead of what was paid. */
export function refundFor(line: Line, qty: number): number {
  const left = Math.max(line.paid_minor - line.refunded_minor, 0);
  const after = line.qty_returned + qty;
  // The return that takes the last units gets exactly what is left.
  if (after >= line.qty_sold) return left;
  const target = roundHalfUp((line.paid_minor * after) / line.qty_sold);
  return Math.min(Math.max(target - line.refunded_minor, 0), left);
}

/** The refund for `qty` (by sale item), as the server will record it. */
export function previewRefund(lines: Line[], qty: Record<string, number>, refundableMinor: number): number {
  let sum = 0;
  for (const l of lines) {
    const n = qty[l.sale_item_id] ?? 0;
    if (n > 0) sum += refundFor(l, n);
  }
  // Never more, in total, than was actually paid and not yet refunded.
  return Math.min(sum, refundableMinor);
}
