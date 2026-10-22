import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cashDue, priceSale, refundFor } from "@business-os/pos-core";

/* The offline till prices exactly as the server does (D-21): the TypeScript
 * pricing runs the same vector file as services/api/tests/pos/test_pricing_vectors.py. */

interface Vector { id: string; kind: "sale" | "refund"; input: Record<string, any>; expected: Record<string, any> }
const file = fileURLToPath(new URL("../../../packages/pos-core/vectors/pricing.json", import.meta.url));
const VECTORS: Vector[] = JSON.parse(readFileSync(file, "utf-8")).vectors;
const BY_ID = Object.fromEntries(VECTORS.map((v) => [v.id, v]));

function price(inp: Record<string, any>) {
  const sale = priceSale(inp.lines, inp.order_discount_minor, { taxOn: inp.tax_on, inclusive: inp.tax_inclusive });
  const [due, rounding] = inp.tender === "cash" ? cashDue(sale.total_minor, inp.cash_rounding_minor) : [sale.total_minor, 0];
  return {
    lines: sale.lines.map((l) => ({
      gross_minor: l.gross_minor, line_discount_minor: l.line_discount_minor,
      line_net_minor: l.gross_minor - l.line_discount_minor, discount_share_minor: l.share_minor,
      net_minor: l.net_minor, excl_minor: l.excl_minor, tax_minor: l.tax_minor, incl_minor: l.total_minor,
    })),
    subtotal_minor: sale.subtotal_minor, line_discount_minor: sale.line_discount_minor,
    order_discount_minor: sale.discount_minor, tax_minor: sale.tax_minor,
    total_minor: sale.total_minor, rounding_minor: rounding, amount_due_minor: due,
  };
}

function refunds(inp: Record<string, any>): number[] {
  const incl = "from_vector" in inp ? price(BY_ID[inp.from_vector].input).lines[inp.line_index].incl_minor : inp.line_incl_minor;
  const out: number[] = [];
  let refunded = 0, returned = 0;
  for (const qty of inp.returns as number[]) {
    const r = refundFor(incl, inp.qty_sold, refunded, returned, qty);
    out.push(r);
    refunded += r;
    returned += qty;
  }
  return out;
}

describe("pos-core pricing vectors", () => {
  it("has the minimum set", () => {
    for (let n = 1; n <= 11; n++) expect(BY_ID[`PV-${String(n).padStart(2, "0")}`]).toBeDefined();
  });
  for (const v of VECTORS) {
    it(`${v.id}: ${v.input && (v as any).case ? (v as any).case : v.kind}`, () => {
      if (v.kind === "sale") expect(price(v.input)).toEqual(v.expected);
      else expect(refunds(v.input)).toEqual(v.expected.refunds);
    });
  }
});
