import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { previewRefund, refundFor } from "./refund";

// The same shared vectors the Python pricing module passes (tests/pos/test_pricing_vectors.py),
// so the Returns preview can never drift from what the server records.
type RefundVector = {
  id: string; case: string; kind: string;
  input: { line_incl_minor?: number; qty_sold: number; returns: number[] };
  expected?: { refunds: number[] };
};
const file = fileURLToPath(new URL("../../../../packages/pos-core/vectors/pricing.json", import.meta.url));
const vectors = (JSON.parse(readFileSync(file, "utf8")).vectors as RefundVector[])
  .filter((v) => v.kind === "refund" && v.input.line_incl_minor !== undefined && v.expected);

describe("refund preview matches the pricing vectors", () => {
  it("has refund vectors to check", () => expect(vectors.length).toBeGreaterThanOrEqual(3));

  for (const v of vectors) {
    it(`${v.id}: ${v.case}`, () => {
      const line = { sale_item_id: "l1", qty_sold: v.input.qty_sold, qty_returned: 0,
                     paid_minor: v.input.line_incl_minor!, refunded_minor: 0 };
      const got: number[] = [];
      for (const qty of v.input.returns) {
        const r = refundFor(line, qty);
        got.push(r);
        line.qty_returned += qty;
        line.refunded_minor += r;
      }
      expect(got).toEqual(v.expected!.refunds);
      expect(line.refunded_minor).toBe(v.input.line_incl_minor); // all units back -> exactly what was paid
    });
  }
});

describe("previewRefund", () => {
  const lines = [
    { sale_item_id: "a", qty_sold: 2, qty_returned: 0, paid_minor: 1000, refunded_minor: 0 },
    { sale_item_id: "b", qty_sold: 1, qty_returned: 0, paid_minor: 500, refunded_minor: 0 },
  ];

  it("adds the chosen lines only", () => {
    expect(previewRefund(lines, { a: 1 }, 1500)).toBe(500);
    expect(previewRefund(lines, { a: 2, b: 1 }, 1500)).toBe(1500);
    expect(previewRefund(lines, {}, 1500)).toBe(0);
  });

  it("never offers more than is still refundable on the sale (cash rounding, earlier returns)", () => {
    expect(previewRefund(lines, { a: 2, b: 1 }, 1450)).toBe(1450);
  });
});
