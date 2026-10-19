/** Whole rupees when the amount is whole; paisa only when there are some —
 *  hiding them made Rs 94.40 look like Rs 94 at the till. */
// Building an Intl.NumberFormat is slow; the till formats every tile and line
// on every keystroke, so keep one per (currency, digits).
const moneyFmt = new Map<string, Intl.NumberFormat>();
export function money(minor: number, currency = "PKR") {
  const digits = Math.round(minor) % 100 === 0 ? 0 : 2;
  const key = `${currency}:${digits}`;
  let f = moneyFmt.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-PK", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
    moneyFmt.set(key, f);
  }
  return f.format(minor / 100);
}

/** Axis/tile-friendly money: ₨1.2M instead of ₨1,234,567. */
export function moneyCompact(minor: number, currency = "PKR") {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(minor / 100);
}

export function relativeDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
}

/** "3m ago" / "2h ago" / "5d ago" — for activity feeds. */
export function timeAgo(iso: string) {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  const units: [number, string][] = [[60, "m"], [3600, "h"], [86400, "d"]];
  for (const [size, suffix] of units) {
    const next = size * (suffix === "m" ? 60 : suffix === "h" ? 24 : 7);
    if (secs < next) return `${Math.floor(secs / size)}${suffix} ago`;
  }
  return relativeDate(iso);
}
