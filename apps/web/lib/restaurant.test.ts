import { describe, expect, it } from "vitest";
import { tableLabels } from "./restaurant";

describe("tableLabels", () => {
  it("expands ranges and keeps names", () => {
    expect(tableLabels("1-4")).toEqual(["1", "2", "3", "4"]);
    expect(tableLabels("1-3, Family 1, 10")).toEqual(["1", "2", "3", "Family 1", "10"]);
    expect(tableLabels("T1, T2")).toEqual(["T1", "T2"]);
  });

  it("drops blanks and repeats", () => {
    expect(tableLabels(" 1, ,1, 2 ")).toEqual(["1", "2"]);
    expect(tableLabels("")).toEqual([]);
  });

  it("refuses a backwards or huge range", () => {
    expect(() => tableLabels("5-1")).toThrow(/5-1/);
    expect(() => tableLabels("1-500")).toThrow(/100/);
  });
});
