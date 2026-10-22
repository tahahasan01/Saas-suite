import { describe, expect, it } from "vitest";
import { BurstDetector, dispatchScan, parseScan, registerScanHandler } from "./scan";

describe("barcode scans (F19)", () => {
  it("validates EAN-13, EAN-8 and UPC-A check digits", () => {
    expect(parseScan("4006381333931")).toEqual({ kind: "ean13", value: "4006381333931", valid: true });
    expect(parseScan("4006381333932").valid).toBe(false);          // one digit misread
    expect(parseScan("96385074")).toEqual({ kind: "ean8", value: "96385074", valid: true });
    expect(parseScan("036000291452")).toEqual({ kind: "upca", value: "036000291452", valid: true });
    expect(parseScan("036000291453").valid).toBe(false);
  });

  it("knows our receipt numbers, online and offline", () => {
    expect(parseScan("R1-2026-27-000042").kind).toBe("receipt");
    expect(parseScan("R1-T2-000007").kind).toBe("receipt");
    expect(parseScan(" sku-123 ")).toEqual({ kind: "code", value: "sku-123", valid: true });
    expect(parseScan("1234567").kind).toBe("code");                 // digits, but no standard length
  });

  it("sees a scanner's burst ending in Enter, never a person typing", () => {
    const d = new BurstDetector();
    const type = (text: string, gap: number, start = 0) =>
      [...text].map((k, i) => d.feed(k, start + i * gap)).filter(Boolean);
    expect(type("4006381333931", 8)).toEqual([]);
    expect(d.feed("Enter", 13 * 8 + 8)).toBe("4006381333931");
    expect(type("1234", 150, 10_000)).toEqual([]);                  // a person: too slow
    expect(d.feed("Enter", 10_000 + 4 * 150)).toBeNull();
    expect(type("12", 5, 20_000)).toEqual([]);                      // too short to be a code
    expect(d.feed("Enter", 20_010)).toBeNull();
    // One stalled key (a busy page) doesn't break a burst; the pace does.
    [..."40063813"].forEach((k, i) => d.feed(k, 40_000 + i * 5));
    d.feed("3", 40_000 + 8 * 5 + 60);
    [..."3931"].forEach((k, i) => d.feed(k, 40_000 + 9 * 5 + 60 + i * 5));
    expect(d.feed("Enter", 40_200)).toBe("4006381333931");
    // Capitals arrive with Shift; it doesn't break the burst.
    ["Shift", "R", "1", "-", "Shift", "T", "2", "-", "0", "0", "0", "0", "0", "7"].forEach((k, i) => d.feed(k, 50_000 + i * 4));
    expect(d.feed("Enter", 50_000 + 14 * 4)).toBe("R1-T2-000007");
    // A slow key in the middle starts the burst again.
    type("999", 5, 30_000);
    type("4006381333931", 5, 31_000);
    expect(d.feed("Enter", 31_000 + 13 * 5)).toBe("4006381333931");
  });

  it("routes each kind to the handler registered for it; the latest wins", async () => {
    const seen: string[] = [];
    const offA = registerScanHandler(["ean13", "code"], (s) => { seen.push(`a:${s.value}`); });
    const offB = registerScanHandler(["receipt"], (s) => { seen.push(`b:${s.value}`); });
    expect(await dispatchScan("4006381333931")).toBe(true);
    expect(await dispatchScan("R1-T2-000007")).toBe(true);
    expect(await dispatchScan("96385074")).toBe(false);              // nobody takes ean8
    const offC = registerScanHandler(["ean13"], (s) => { seen.push(`c:${s.value}`); });
    await dispatchScan("4006381333931");
    offC();
    await dispatchScan("4006381333931");
    offA();
    offB();
    expect(await dispatchScan("4006381333931")).toBe(false);
    expect(seen).toEqual(["a:4006381333931", "b:R1-T2-000007", "c:4006381333931", "a:4006381333931"]);
  });
});
