import { describe, expect, it } from "vitest";
import { filterOptions, nextIndex } from "./roving";

describe("roving focus", () => {
  it("moves along the axis, wraps, and jumps to the ends", () => {
    expect(nextIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextIndex(2, "ArrowRight", 3)).toBe(0);
    expect(nextIndex(0, "ArrowLeft", 3)).toBe(2);
    expect(nextIndex(1, "Home", 3)).toBe(0);
    expect(nextIndex(1, "End", 3)).toBe(2);
  });

  it("ignores the other axis and unrelated keys", () => {
    expect(nextIndex(1, "ArrowDown", 3)).toBeNull();
    expect(nextIndex(1, "ArrowDown", 3, "vertical")).toBe(2);
    expect(nextIndex(1, "ArrowRight", 3, "vertical")).toBeNull();
    expect(nextIndex(1, "a", 3)).toBeNull();
  });

  it("follows the reading direction in RTL", () => {
    expect(nextIndex(0, "ArrowLeft", 3, "horizontal", "rtl")).toBe(1);
    expect(nextIndex(0, "ArrowRight", 3, "horizontal", "rtl")).toBe(2);
  });

  it("skips disabled items and answers null when there is nothing", () => {
    expect(nextIndex(0, "ArrowDown", 4, "vertical", "ltr", (i) => i === 1)).toBe(2);
    expect(nextIndex(0, "ArrowDown", 0, "vertical")).toBeNull();
    expect(nextIndex(0, "ArrowDown", 2, "vertical", "ltr", () => true)).toBeNull();
  });
});

describe("combobox filtering", () => {
  const opts = [{ value: "1", label: "Ali Raza" }, { value: "2", label: "Zainab Ali" }, { value: "3", label: "Café Lahore" }];

  it("matches anywhere, case- and accent-blind, with word starts first", () => {
    expect(filterOptions(opts, "ali").map((o) => o.value)).toEqual(["1", "2"]);
    expect(filterOptions(opts, "cafe").map((o) => o.value)).toEqual(["3"]);
    expect(filterOptions(opts, "LAH").map((o) => o.value)).toEqual(["3"]);
  });

  it("an empty query keeps everything in order", () => {
    expect(filterOptions(opts, "  ").map((o) => o.value)).toEqual(["1", "2", "3"]);
  });
});
