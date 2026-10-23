import { describe, expect, it } from "vitest";
import { stockState, TILE_COLORS, tileColor, tileStyle } from "./tiles";

const cats = new Map([["c1", "blue"], ["c2", null]]);

describe("tileColor", () => {
  it("prefers the product's own colour, then its category's", () => {
    expect(tileColor({ color: "red", category_id: "c1" }, cats)).toBe("red");
    expect(tileColor({ color: null, category_id: "c1" }, cats)).toBe("blue");
    expect(tileColor({ color: null, category_id: "c2" }, cats)).toBeNull();
    expect(tileColor({ category_id: null }, cats)).toBeNull();
  });

  it("ignores a colour outside the palette", () => {
    expect(tileColor({ color: "neon", category_id: null }, cats)).toBeNull();
  });
});

describe("tileStyle", () => {
  it("uses the palette's CSS tokens, nothing for a plain tile", () => {
    expect(tileStyle("teal")).toEqual({ background: "var(--tile-teal-bg)", borderTopColor: "var(--tile-teal-edge)" });
    expect(tileStyle(null)).toBeUndefined();
    expect(TILE_COLORS).toHaveLength(10);
  });
});

describe("stockState", () => {
  const base = { stock_qty: 0, low_stock_at: 0, unit: "pc", track_stock: true };
  it("calls a tracked product with nothing left out of stock", () => {
    expect(stockState(base)).toEqual({ out: true, low: false, text: "Out of stock" });
  });
  it("never calls an untracked product (a dish, a service) out of stock", () => {
    expect(stockState({ ...base, track_stock: false })).toEqual({ out: false, low: false, text: "" });
  });
  it("warns when low and shows what's left otherwise", () => {
    expect(stockState({ ...base, stock_qty: 2, low_stock_at: 5 })).toEqual({ out: false, low: true, text: "Low stock · 2 pc left" });
    expect(stockState({ ...base, stock_qty: 9, low_stock_at: 5 })).toEqual({ out: false, low: false, text: "9 pc in stock" });
  });
});
