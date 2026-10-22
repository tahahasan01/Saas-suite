import { describe, expect, it } from "vitest";
import { backoffMs, batches, needsReset, offlineRef, settle } from "./plan";

describe("offline sync planning", () => {
  it("backs off exponentially with jitter, capped at 5 minutes", () => {
    expect(backoffMs(0, 1)).toBe(1_000);
    expect(backoffMs(3, 1)).toBe(8_000);
    expect(backoffMs(3, 0)).toBe(4_000);          // jitter keeps at least half
    expect(backoffMs(30, 1)).toBe(300_000);
    expect(backoffMs(30, 0.5)).toBeLessThanOrEqual(300_000);
  });

  it("numbers offline receipts <REG>-<DEV>-NNNNNN", () => {
    expect(offlineRef("R1", "T1", 42)).toBe("R1-T1-000042");
    expect(() => offlineRef("R1", "T1", 1_000_000)).toThrow();
  });

  it("sends at most 100 orders a batch", () => {
    const b = batches(Array.from({ length: 250 }, (_, i) => i), 100);
    expect(b.map((x) => x.length)).toEqual([100, 100, 50]);
  });

  it("clears created and duplicate orders, parks conflicts, keeps the rest", () => {
    const out = settle(["a", "b", "c", "d"], [
      { client_uuid: "a", status: "created", needs_review: true, reasons: ["oversold"] },
      { client_uuid: "b", status: "duplicate" },
      { client_uuid: "c", status: "conflict", error: "Product not found" },
    ]);
    expect(out.done).toEqual(["a", "b"]);
    expect(out.conflicts).toEqual([{ id: "c", error: "Product not found" }]);
    expect(out.flagged).toEqual(["a"]);
    expect(out.unanswered).toEqual(["d"]);
  });
  it("starts the catalogue again when the server says so or the register's config moved", () => {
    const feed = (cv: number, reset = false) => ({ reset, register: { config_version: cv } });
    expect(needsReset(undefined, feed(3))).toBe(false);      // first pull: nothing cached to drop
    expect(needsReset(3, feed(3))).toBe(false);
    expect(needsReset(3, feed(4))).toBe(true);
    expect(needsReset(3, feed(3, true))).toBe(true);         // a cursor ahead of the server
  });
});
