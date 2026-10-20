/* The Returns preview. Mirrors services/api/app/pricing.py `refund_for` and the
 * cap in `create_return`, fed by the figures the sale lookup now returns, so
 * the amount on screen is the amount the server will record — not list price
 * x qty, which ignored the discount and paid out more cash than was recorded
 * (audit I8). Keep the two in step. */

import type { RefundableLine } from "@business-os/types";

type Line = Pick<RefundableLine, "sale_item_id" | "qty_sold" | "qty_returned" | "paid_minor" | "refunded_minor">;

/** Python's round() on a Decimal: halves go to the even neighbour. */
function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}

export function refundFor(line: Line, qty: number): number {
  // The return that takes the last units gets exactly what is left.
  if (line.qty_returned + qty >= line.qty_sold) return line.paid_minor - line.refunded_minor;
  return roundHalfEven((line.paid_minor * qty) / line.qty_sold);
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
