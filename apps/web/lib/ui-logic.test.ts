import { describe, expect, it } from "vitest";
import { matches, parseCombo } from "./useHotkey";
import { pageCount, pageSummary } from "@/components/pagination";
// A plain .mjs ESLint plugin (allowJs lets TypeScript read it).
import { physicalClass } from "../eslint/logical-css.mjs";

const key = (k: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>> = {}) =>
  ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe("hotkeys", () => {
  it("parses combos", () => expect(parseCombo("mod+k")).toEqual({ key: "k", mod: true, shift: false, alt: false }));
  it("matches the till's F-keys exactly", () => {
    expect(matches("F7", key("F7"))).toBe(true);
    expect(matches("F7", key("F6"))).toBe(false);
    expect(matches("F7", key("F7", { ctrlKey: true }))).toBe(false);
  });
  it("treats Ctrl and ⌘ as the same mod", () => {
    expect(matches("mod+k", key("k", { ctrlKey: true }))).toBe(true);
    expect(matches("mod+k", key("K", { metaKey: true }))).toBe(true);
    expect(matches("mod+k", key("k"))).toBe(false);
  });
});

describe("pagination", () => {
  it("summarises the page", () => {
    expect(pageSummary({ page: 1, pageSize: 50, total: 230, noun: "items" })).toBe("Showing 1–50 of 230 items");
    expect(pageSummary({ page: 5, pageSize: 50, total: 230, noun: "items" })).toBe("Showing 201–230 of 230 items");
    expect(pageSummary({ page: 1, pageSize: 50, total: 12, noun: "items" })).toBe("12 items");
  });
  it("counts pages, with at least one", () => {
    expect(pageCount(230, 50)).toBe(5);
    expect(pageCount(0, 50)).toBe(1);
  });
});

describe("logical-css lint rule", () => {
  it.each([
    ["ml-2", "ms-"], ["md:pr-10", "pe-"], ["-mr-2", "me-"], ["left-0", "start-"], ["right-[3px]", "end-"],
    ["text-left", "text-start"], ["border-r", "border-e"], ["rounded-l-lg", "rounded-s-"], ["rounded-tr-xl", "rounded-se-"],
    ["!pl-4", "ps-"], ["hover:text-right", "text-end"],
  ])("flags %s (use %s…)", (token, fix) => expect(physicalClass(token)).toBe(fix));

  it.each(["ms-2", "pe-10", "start-0", "text-start", "rounded-lg", "border-line", "left", "inset-x-0", "px-4", "space-x-2", "prose"])(
    "allows %s", (token) => expect(physicalClass(token)).toBeNull());
});
