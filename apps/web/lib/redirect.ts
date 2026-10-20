/** Where to go after signing in. Only a path on this site: `?next=https://evil.example`
 *  or `//evil.example` would make the login page an open redirect. */
export function safeNext(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  // Never back to an auth screen (a loop), and never a path hiding control characters.
  if (/^\/(login|signup)(\/|\?|$)/.test(raw) || [...raw].some((c) => c.charCodeAt(0) < 0x20)) return fallback;
  return raw;
}
