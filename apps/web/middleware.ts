import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce } from "@/lib/csp";
import { isAppRoute, SESSION_COOKIE } from "@/lib/routes";

/* Runs before every page (not /api, not static assets):
 *  1. A cheap gate for app routes: no session cookie -> /login?next=…, before
 *     any of the page's JavaScript loads. It only checks the cookie exists; the
 *     API still decides whether the session is valid (an expired one gets a 401
 *     there, which lib/api turns into the same redirect). The cookie is visible
 *     here because the API is reached through the same-origin /api rewrite.
 *  2. A per-request CSP nonce (lib/csp.ts explains the policy). */

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isAppRoute(pathname) && !req.cookies.get(SESSION_COOKIE)?.value) {
    const login = req.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(login);
  }

  const nonce = newNonce();
  const csp = buildCsp(nonce, {
    dev: process.env.NODE_ENV !== "production",
    connectSrc: (process.env.CSP_CONNECT_SRC ?? "").split(" ").filter(Boolean),
    // Web forms (/f/…) may sit in an iframe on the business's own https site.
    embeddable: pathname.startsWith("/f/"),
  });
  // Next reads the nonce from the *request* CSP header and stamps it on its own
  // scripts; x-nonce is for the root layout's theme script.
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  // Pages only: the API proxy, build assets and files with an extension skip it.
  matcher: ["/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
