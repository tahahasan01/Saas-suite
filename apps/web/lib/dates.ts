/* The business day is Pakistan's, not UTC's. `toISOString().slice(0, 10)` is
 * yesterday from midnight to 5am PKT, which showed staff "Not clocked in" after
 * they had, and opened payroll on last month on the 1st. */

export const BUSINESS_TZ = "Asia/Karachi";

/** YYYY-MM-DD for `d` in Pakistan time. */
export function dayPKT(d: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** YYYY-MM for `d` in Pakistan time (the value an <input type="month"> takes). */
export function monthPKT(d: Date = new Date()): string {
  return dayPKT(d).slice(0, 7);
}

/** True when an ISO timestamp or date falls on today's Pakistan date. */
export function isTodayPKT(iso: string): boolean {
  return (iso.length === 10 ? iso : dayPKT(new Date(iso))) === dayPKT();
}
