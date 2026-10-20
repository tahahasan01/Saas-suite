import { afterEach, describe, expect, it, vi } from "vitest";
import { dayPKT, isTodayPKT, monthPKT } from "./dates";

describe("the business day is Pakistan's", () => {
  afterEach(() => vi.useRealTimers());

  it("is already tomorrow from 19:00 UTC (midnight PKT)", () => {
    expect(dayPKT(new Date("2026-03-23T18:59:59Z"))).toBe("2026-03-23");
    expect(dayPKT(new Date("2026-03-23T19:00:00Z"))).toBe("2026-03-24");
  });

  it("opens the new month on the 1st in Karachi, not at 05:00", () => {
    // 00:30 PKT on 1 April is still 31 March in UTC: payroll used to open on March.
    expect(monthPKT(new Date("2026-03-31T19:30:00Z"))).toBe("2026-04");
  });

  it("knows a check-in just after local midnight is today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-24T01:00:00Z")); // 06:00 PKT on the 24th
    expect(isTodayPKT("2026-03-23T19:10:00Z")).toBe(true); // 00:10 PKT on the 24th
    expect(isTodayPKT("2026-03-24")).toBe(true);
    expect(isTodayPKT("2026-03-23")).toBe(false);
  });
});
