import { describe, expect, it } from "vitest";
import { buildIndex, searchIndex } from "./search";

const p = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  ({ id, name, sku: null, barcode: null, active: true, ...extra }) as never;

describe("the till's local search index (F21)", () => {
  const index = buildIndex([
    p("1", "Dawn Bread Large", { barcode: "4006381333931" }),
    p("2", "Lays Masala", { sku: "LAY-M" }),
    p("3", "Bread Crumbs"),
    p("4", "Shan Biryani Masala"),
    p("5", "Old Bread", { active: false }),
  ]);
  const ids = (q: string) => searchIndex(index, q).map((x: { id: string }) => x.id);

  it("ranks an exact barcode or SKU first, then name prefix, word prefix, anywhere", () => {
    expect(ids("4006381333931")).toEqual(["1"]);
    expect(ids("lay-m")).toEqual(["2"]);
    expect(ids("bread")).toEqual(["3", "1"]);            // "Bread Crumbs" starts with it
    expect(ids("masala")).toEqual(["2", "4"]);           // word prefix, then by name
    expect(ids("ead")).toEqual(["3", "1"]);              // anywhere in the name
  });

  it("matches every word, in any order, and never shows archived products", () => {
    expect(ids("masala shan")).toEqual(["4"]);
    expect(ids("old")).toEqual([]);
    expect(ids("")).toEqual(["3", "1", "2", "4"]);       // everything active, by name
  });

  it("has no cap: a 5,000-product catalogue is searched in full", () => {
    const big = buildIndex(Array.from({ length: 5000 }, (_, i) => p(String(i), `Item ${String(i).padStart(4, "0")}`)));
    expect(searchIndex(big, "item")).toHaveLength(5000);
    expect(searchIndex(big, "4999").map((x: { id: string }) => x.id)).toEqual(["4999"]);
  });
});
