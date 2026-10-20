/* The only place the web app calls Intl (F26). Pages format through these
 * helpers, so the locale (en-PK today, ur-PK with the Urdu UI) changes in one
 * line, and the lint rule in eslint.config.mjs keeps `Intl.*` and
 * `toLocale*String` out of everywhere else.
 *
 * Formatters are cached: building an Intl object is slow, and the till formats
 * every tile and cart line on every keystroke. */

export const LOCALE = "en-PK";

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

function numberFmt(opts: Intl.NumberFormatOptions, locale = LOCALE): Intl.NumberFormat {
  const key = `n|${locale}|${JSON.stringify(opts)}`;
  let f = cache.get(key) as Intl.NumberFormat | undefined;
  if (!f) { f = new Intl.NumberFormat(locale, opts); cache.set(key, f); }
  return f;
}

/** A cached Intl.DateTimeFormat. lib/dates.ts uses it for business-day maths. */
export function dateFmt(opts: Intl.DateTimeFormatOptions, locale = LOCALE): Intl.DateTimeFormat {
  const key = `d|${locale}|${JSON.stringify(opts)}`;
  let f = cache.get(key) as Intl.DateTimeFormat | undefined;
  if (!f) { f = new Intl.DateTimeFormat(locale, opts); cache.set(key, f); }
  return f;
}

// ── Money ────────────────────────────────────────────────────────────────────

/** Whole rupees when the amount is whole; paisa only when there are some —
 *  hiding them made Rs 94.40 look like Rs 94 at the till. */
export function money(minor: number, currency = "PKR"): string {
  const digits = Math.round(minor) % 100 === 0 ? 0 : 2;
  return numberFmt({ style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(minor / 100);
}

/** Axis/tile-friendly money: ₨1.2M instead of ₨1,234,567. */
export function moneyCompact(minor: number, currency = "PKR"): string {
  return numberFmt({ style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(minor / 100);
}

// ── Numbers ──────────────────────────────────────────────────────────────────

/** 12,345 — grouped the local way. */
export function formatNumber(n: number, opts: Intl.NumberFormatOptions = {}): string {
  return numberFmt(opts).format(n);
}

// ── Dates and times ──────────────────────────────────────────────────────────
// Timestamps (ISO with a time) show in the viewer's zone unless a timeZone is
// given; calendar dates ("2026-03-23", "2026-03") are not instants and are
// formatted as written, never shifted a day by a time zone.

const asInstant = (iso: string | Date) => (iso instanceof Date ? iso : new Date(iso));
const asCalendar = (ymd: string) => new Date(`${ymd.length === 7 ? `${ymd}-01` : ymd.slice(0, 10)}T00:00:00Z`);

/** 23 Mar 2026 (an instant). */
export function formatDate(iso: string | Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return dateFmt(opts).format(asInstant(iso));
}

/** 09:05 am (an instant). */
export function formatTime(iso: string | Date, opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }): string {
  return dateFmt(opts).format(asInstant(iso));
}

/** 23 Mar 2026, 9:05 pm (an instant), e.g. in Pakistan time for a receipt. */
export function formatDateTime(iso: string | Date, timeZone?: string): string {
  return dateFmt({ dateStyle: "medium", timeStyle: "short", ...(timeZone ? { timeZone } : {}) }).format(asInstant(iso));
}

/** A calendar date as written: "2026-03-23" -> 23 Mar 2026 (or `opts`, e.g. a weekday). */
export function formatDay(ymd: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return dateFmt({ ...opts, timeZone: "UTC" }).format(asCalendar(ymd));
}

/** "2026-03" -> March 2026. */
export function formatMonth(ym: string): string {
  return formatDay(ym, { month: "long", year: "numeric" });
}

/** Kept for existing callers: an instant as 23 Mar 2026. */
export function relativeDate(iso: string): string {
  return formatDate(iso);
}

/** "3m ago" / "2h ago" / "5d ago" — for activity feeds. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const secs = Math.round((now - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  const units: [number, string][] = [[60, "m"], [3600, "h"], [86400, "d"]];
  for (const [size, suffix] of units) {
    const next = size * (suffix === "m" ? 60 : suffix === "h" ? 24 : 7);
    if (secs < next) return `${Math.floor(secs / size)}${suffix} ago`;
  }
  return relativeDate(iso);
}
