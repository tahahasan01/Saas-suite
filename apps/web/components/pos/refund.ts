/* The Returns preview. Mirrors services/api/app/pricing.py `refund_for` and the
 * cap in `create_return`, fed by the figures the sale lookup now returns, so
 * the amount on screen is the amount the server will record — not list price
 * x qty, which ignored the discount and paid out more cash than was recorded
 * (audit I8). Keep the two in step. */

export interface RefundableLine {
  sale_item_id: string;
  qty_sold: number;
  qty_returned: number;
  /** What the customer paid for the line: after discount, with tax. */
  paid_minor?: number;
  /** Already given back on earlier returns. */
  refunded_minor?: number;
}

/** Python's round() on a Decimal: halves go to the even neighbour. */
function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}

export function refundFor(line: Required<RefundableLine>, qty: number): number {
  // The return that takes the last units gets exactly what is left.
  if (line.qty_returned + qty >= line.qty_sold) return line.paid_minor - line.refunded_minor;
  return roundHalfEven((line.paid_minor * qty) / line.qty_sold);
}

/** The refund for `qty` (by sale item), or null when the server didn't send
 *  the figures (an API older than this screen) — never a guess. */
export function previewRefund(
  lines: RefundableLine[], qty: Record<string, number>, refundableMinor: number | undefined,
): number | null {
  if (refundableMinor === undefined) return null;
  let sum = 0;
  for (const l of lines) {
    const n = qty[l.sale_item_id] ?? 0;
    if (n <= 0) continue;
    if (l.paid_minor === undefined || l.refunded_minor === undefined) return null;
    sum += refundFor(l as Required<RefundableLine>, n);
  }
  // Never more, in total, than was actually paid and not yet refunded.
  return Math.min(sum, refundableMinor);
}
