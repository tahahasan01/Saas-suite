import { describe, expect, it } from "vitest";
import { TILE_COLORS, tileColor, tileStyle } from "./tiles";

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
