// Must match services/api/app/security.py SESSION_COOKIE.
export const SESSION_COOKIE = "bos_session";

/** First path segments that need a signed-in user: the app/(app) route group. */
const APP_ROUTES = new Set(["dashboard", "crm", "invoices", "pos", "hrms", "me", "settings", "automations"]);

export function isAppRoute(pathname: string): boolean {
  return APP_ROUTES.has(pathname.split("/")[1] ?? "");
}
