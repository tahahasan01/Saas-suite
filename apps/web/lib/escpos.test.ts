import { describe, expect, it } from "vitest";
import { COLUMNS, DRAWER_KICK, encodeReceipt, raster, twoColumns, type ReceiptDoc } from "./escpos";

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
