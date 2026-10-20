import { describe, expect, it } from "vitest";
import { formatDay, formatMonth, formatNumber, money, timeAgo } from "./format";

const digits = (s: string) => s.replace(/[^\d.]/g, "");

describe("money", () => {
  it("shows whole rupees without paisa and keeps paisa when there are some", () => {
    expect(digits(money(9400))).toBe("94");
    expect(digits(money(9440))).toBe("94.40");
  });
  it("groups thousands", () => {
    expect(money(123456700)).toMatch(/1,234,567/);
  });
});

describe("dates", () => {
  it("formats a calendar date as written, never a day early", () => {
    // A YYYY-MM-DD parsed as a local instant slipped a day west of UTC.
    expect(formatDay("2026-03-01")).toMatch(/^1 Mar 2026$/);
    expect(formatDay("2026-03-01", { weekday: "short" })).toBe("Sun");
  });
  it("names the month", () => {
    expect(formatMonth("2026-07")).toBe("July 2026");
  });
});

describe("formatNumber", () => {
  it("groups the local way", () => expect(formatNumber(1234567)).toBe("1,234,567"));
});

describe("timeAgo", () => {
  const now = Date.parse("2026-03-24T12:00:00Z");
  it("speaks in minutes, hours and days", () => {
    expect(timeAgo("2026-03-24T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-03-24T11:55:00Z", now)).toBe("5m ago");
    expect(timeAgo("2026-03-24T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-03-21T12:00:00Z", now)).toBe("3d ago");
  });
});
