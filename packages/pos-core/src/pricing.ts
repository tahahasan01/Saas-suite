/* The one pricing function, in TypeScript, for the offline till (D-21, F18).
 * It mirrors services/api/app/pricing.py and must pass the same vectors
 * (vectors/pricing.json): integer paisa, half-up rounding, the order
 * discount spread by largest remainder, tax split per line. Decimals (qty,
 * tax rate) are exact rationals over BigInt, never floats. */

/** A decimal as numerator / 10^scale, parsed from its text so 0.1 stays 0.1. */
interface Dec { n: bigint; d: bigint }

function dec(x: number | string): Dec {
  const s = typeof x === "number" ? numberText(x) : x.trim();
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m) throw new Error(`not a decimal: ${s}`);
  const frac = m[3] ?? "";
  const n = BigInt(`${m[1]}${m[2] || "0"}${frac}`);
  return { n, d: 10n ** BigInt(frac.length) };
}

function numberText(x: number): string {
  // toString() can give "1e-7"; money inputs never need more than 6 places.
  const s = String(x);
  return /e/i.test(s) ? x.toFixed(6) : s;
}

/** round(a / b) half away from zero, b > 0: what Decimal ROUND_HALF_UP does. */
function divRound(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new Error("divisor must be positive");
  const neg = a < 0n;
  const abs = neg ? -a : a;
  const q = (2n * abs + b) / (2n * b);
  return neg ? -q : q;
}

const num = (b: bigint) => Number(b);

export interface PricedLine {
  gross_minor: number;
  line_discount_minor: number;   // this line's own discount (capped at gross)
  share_minor: number;           // its part of the order discount
  net_minor: number;             // gross - both discounts
  excl_minor: number;            // value excluding sales tax
  tax_minor: number;
  total_minor: number;           // incl: what the customer pays for the line
}

export interface PricedSale {
  lines: PricedLine[];
  subtotal_minor: number;
  discount_minor: number;        // order discount actually applied
  line_discount_minor: number;
  tax_minor: number;
  total_minor: number;
}

export interface LineIn { unit_price_minor: number; qty: number | string; tax_rate_pct: number | string; line_discount_minor?: number }

/** Split `amount` across `weights` in whole paisa that add back exactly:
 *  floor parts, then a paisa each to the largest remainders (ties: lowest index). */
export function allocate(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (amount <= 0 || total <= 0) return weights.map(() => 0);
  const A = BigInt(amount), T = BigInt(total);
  const parts = weights.map((w) => (A * BigInt(w)) / T);
  const rem = weights.map((w) => (A * BigInt(w)) % T);
  const order = weights.map((_, i) => i).sort((i, j) => (rem[j] > rem[i] ? 1 : rem[j] < rem[i] ? -1 : i - j));
  let left = A - parts.reduce((a, b) => a + b, 0n);
  for (const i of order) {
    if (left <= 0n) break;
    parts[i] += 1n;
    left -= 1n;
  }
  return parts.map(num);
}

/** (value excluding tax, tax) for a line total, like fbr.split_tax. */
export function splitTax(totalMinor: number, ratePct: number | string, inclusive: boolean): [number, number] {
  const r = dec(ratePct);
  if (r.n <= 0n) return [totalMinor, 0];
  const t = BigInt(totalMinor);
  if (inclusive) {
    // excl = total / (1 + rate/100) = total·100·d / (100·d + n); tax by subtraction.
    const excl = divRound(t * 100n * r.d, 100n * r.d + r.n);
    return [num(excl), num(t - excl)];
  }
  return [totalMinor, num(divRound(t * r.n, 100n * r.d))];
}

export function priceSale(lines: LineIn[], discountMinor: number, opts: { taxOn: boolean; inclusive: boolean }): PricedSale {
  const gross = lines.map((l) => { const q = dec(l.qty); return num(divRound(BigInt(l.unit_price_minor) * q.n, q.d)); });
  const lineDisc = lines.map((l, i) => Math.min(Math.max(l.line_discount_minor ?? 0, 0), gross[i]));
  const lineNet = gross.map((g, i) => g - lineDisc[i]);
  const discount = Math.min(Math.max(discountMinor, 0), lineNet.reduce((a, b) => a + b, 0));
  const shares = allocate(discount, lineNet);
  const priced = lines.map((l, i): PricedLine => {
    const net = lineNet[i] - shares[i];
    const [excl, tax] = opts.taxOn && dec(l.tax_rate_pct).n > 0n ? splitTax(net, l.tax_rate_pct, opts.inclusive) : [net, 0];
    return { gross_minor: gross[i], line_discount_minor: lineDisc[i], share_minor: shares[i], net_minor: net,
             excl_minor: excl, tax_minor: tax, total_minor: excl + tax };
  });
  const sum = (k: keyof PricedLine) => priced.reduce((a, p) => a + p[k], 0);
  return { lines: priced, subtotal_minor: gross.reduce((a, b) => a + b, 0), discount_minor: discount,
           line_discount_minor: lineDisc.reduce((a, b) => a + b, 0), tax_minor: sum("tax_minor"), total_minor: sum("total_minor") };
}

/** What a cash customer pays: the total rounded half-up to the cash unit,
 *  and the rounding. A unit of 0 means none. The invoice total never changes. */
export function cashDue(totalMinor: number, roundingMinor: number): [number, number] {
  if (roundingMinor <= 0) return [totalMinor, 0];
  const due = Math.floor((totalMinor + Math.floor(roundingMinor / 2)) / roundingMinor) * roundingMinor;
  return [due, due - totalMinor];
}

/** A return's share of what the line paid, by cumulative rounding (see pricing.refund_for). */
export function refundFor(lineTotalMinor: number, qtySold: number | string, refundedMinor: number,
                          qtyReturned: number | string, qty: number | string): number {
  const left = lineTotalMinor - refundedMinor;
  const sold = dec(qtySold), a = dec(qtyReturned), b = dec(qty);
  // after = a + b and sold, over the common denominator sold.d·a.d·b.d.
  const afterN = a.n * sold.d * b.d + b.n * sold.d * a.d;
  const soldN = sold.n * a.d * b.d;
  if (afterN >= soldN) return Math.max(left, 0);
  const target = num(divRound(BigInt(lineTotalMinor) * afterN, soldN));
  return Math.min(Math.max(target - refundedMinor, 0), Math.max(left, 0));
}
