// Must match services/api/app/security.py SESSION_COOKIE.
export const SESSION_COOKIE = "bos_session";

/** First path segments that need a signed-in user: the app/(app) route group,
 *  and the full-screen till (app/(register)). */
const APP_ROUTES = new Set(["dashboard", "crm", "contacts", "my-day", "invoices", "pos", "hrms", "me", "settings",
                            "automations", "register"]);

export function isAppRoute(pathname: string): boolean {
  return APP_ROUTES.has(pathname.split("/")[1] ?? "");
}
