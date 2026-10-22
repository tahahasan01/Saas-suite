import { describe, expect, it } from "vitest";
import { COLUMNS, DRAWER_KICK, encodeReceipt, encodeReceiptRaster, monochrome, needsRaster, raster, twoColumns, type ReceiptDoc } from "./escpos";

const text = (b: Uint8Array) => new TextDecoder("latin1").decode(b);
const has = (b: Uint8Array, seq: number[]) => {
  outer: for (let i = 0; i <= b.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) if (b[i + j] !== seq[j]) continue outer;
    return true;
  }
  return false;
};

const doc: ReceiptDoc = {
  header: ["Ali General Store"],
  stamp: "DUPLICATE",
  meta: ["R1-2026-000042", "22 Oct 2026, 3:15 pm"],
  lines: [{ left: "2 x Tapal Danedar 950g Family Pack Extra Long Name", right: "Rs 2,400" }],
  totals: [{ left: "Total", right: "Rs 2,400", bold: true }],
  footer: ["FBR 1234567890"],
};

describe("ESC/POS receipts", () => {
  it("fits every line to the roll: 32 columns on 58mm, 48 on 80mm", () => {
    expect(COLUMNS[58]).toBe(32);
    expect(COLUMNS[80]).toBe(48);
    for (const paper of [58, 80] as const) {
      const lines = text(encodeReceipt(doc, paper)).split("\n");
      // Strip whole commands (ESC @, ESC a n, ESC E n, GS V B n, ESC p m t1 t2): only printed text counts.
      const printed = (l: string) => l.replace(/\x1b@|\x1b[aE][\s\S]|\x1dVB[\s\S]|\x1bp[\s\S]{3}/g, "");
      for (const l of lines) expect(printed(l).length).toBeLessThanOrEqual(COLUMNS[paper]);
    }
  });

  it("wraps a long item name and keeps the amount on the right", () => {
    const rows = twoColumns("2 x Tapal Danedar 950g Family Pack Extra Long Name", "Rs 2,400", 32);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0].endsWith("Rs 2,400")).toBe(true);
    expect(rows.every((r) => r.length <= 32)).toBe(true);
  });

  it("starts with init, ends with a feed-and-cut, and prints the stamp", () => {
    const b = encodeReceipt(doc, 80);
    expect([...b.slice(0, 2)]).toEqual([0x1b, 0x40]);
    expect(has(b, [0x1d, 0x56, 0x42])).toBe(true);
    expect(text(b)).toContain("DUPLICATE");
    expect(text(b)).toContain("R1-2026-000042");
  });

  it("kicks the drawer only when asked", () => {
    expect(has(encodeReceipt(doc, 80), DRAWER_KICK)).toBe(false);
    expect(has(encodeReceipt(doc, 80, { kick: true }), DRAWER_KICK)).toBe(true);
  });

  it("never sends a byte the printer's code page can't show", () => {
    const b = encodeReceipt({ ...doc, header: ["Café ☕ دکان"] }, 58);
    expect([...b].every((x) => x < 0x80)).toBe(true);
    expect(text(b)).toContain("Caf?");
  });

  it("rasters a bitmap as GS v 0 with the width in bytes", () => {
    const w = 10, h = 2;
    const px = new Uint8Array(w * h).fill(0);
    px[0] = 1;            // top-left dot
    px[w + 9] = 1;        // bottom-right dot
    const r = raster(px, w, h);
    expect([...r.slice(0, 8)]).toEqual([0x1d, 0x76, 0x30, 0x00, 2, 0, 2, 0]);
    expect([...r.slice(8)]).toEqual([0b10000000, 0, 0, 0b01000000]);
  });
});

describe("raster receipts (Urdu, symbols)", () => {
  const doc = (name: string) => ({ header: ["Shop"], meta: ["R1-2026-27-000001"], lines: [{ left: name, right: "100" }],
                                   totals: [{ left: "Total", right: "100", bold: true }], footer: [] });

  it("prints as an image only when the text mode would lose characters", () => {
    expect(needsRaster(doc("Dawn Bread"))).toBe(false);
    expect(needsRaster(doc("دودھ"))).toBe(true);
    expect(needsRaster({ ...doc("Milk"), footer: ["شکریہ"] })).toBe(true);
  });

  it("turns canvas pixels into 1-bit dots by brightness", () => {
    // Two pixels: black, white (RGBA).
    expect([...monochrome(Uint8ClampedArray.from([0, 0, 0, 255, 255, 255, 255, 255]), 2, 1)]).toEqual([1, 0]);
    // A transparent pixel is paper, not ink.
    expect([...monochrome(Uint8ClampedArray.from([0, 0, 0, 0]), 1, 1)]).toEqual([0]);
  });

  it("wraps the image in init, GS v 0, feed-and-cut and the drawer kick", () => {
    const render = () => ({ px: new Uint8Array(16 * 2).fill(1), width: 16, height: 2 });
    const bytes = [...encodeReceiptRaster(doc("دودھ"), 58, render, { kick: true })];
    expect(bytes.slice(0, 2)).toEqual([0x1b, 0x40]);
    expect(bytes.slice(2, 10)).toEqual([0x1d, 0x76, 0x30, 0x00, 2, 0, 2, 0]);
    expect(bytes.slice(10, 14)).toEqual([0xff, 0xff, 0xff, 0xff]);
    expect(bytes.slice(-9)).toEqual([0x1d, 0x56, 0x42, 0x03, ...DRAWER_KICK]);
  });
  it("sends a tall receipt in bands of 256 rows", () => {
    const render = () => ({ px: new Uint8Array(8 * 300), width: 8, height: 300 });
    const bytes = encodeReceiptRaster(doc("دودھ"), 80, render);
    const heads = [...bytes].map((b, j) => (b === 0x1d && bytes[j + 1] === 0x76 && bytes[j + 2] === 0x30 ? j : -1)).filter((j) => j >= 0);
    expect(heads).toHaveLength(2);
    expect([bytes[heads[0] + 6], bytes[heads[0] + 7]]).toEqual([0, 1]);      // 256 rows
    expect([bytes[heads[1] + 6], bytes[heads[1] + 7]]).toEqual([44, 0]);     // the other 44
  });
});
