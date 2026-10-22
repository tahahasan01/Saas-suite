/* Content-Security-Policy for every page (07 S9).
 *
 * Scripts: a fresh nonce per request plus 'strict-dynamic'. Next reads the
 * nonce from the request's CSP header (set in middleware.ts) and puts it on its
 * own inline bootstrap scripts; the root layout puts it on the theme script.
 * So there is no 'unsafe-inline' for scripts anywhere, and no hash list to keep
 * in sync. The cost: pages render per request (no static HTML), which this app
 * — all of it behind a session — was doing anyway.
 *
 * Styles keep 'unsafe-inline': React `style={}` props and Radix positioning
 * write inline styles, and style injection isn't script execution.
 *
 * Dev only: React Refresh needs 'unsafe-eval', and HMR talks over a websocket. */

export type CspOptions = {
  dev: boolean;
  /** Extra connect-src origins, e.g. a Sentry ingest host (CSP_CONNECT_SRC, space-separated). */
  connectSrc?: string[];
};

export function buildCsp(nonce: string, { dev, connectSrc = [] }: CspOptions): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(dev ? ["ws:", "wss:"] : []), ...connectSrc],
    // The offline till's service worker and manifest (3D): 'strict-dynamic'
    // makes script-src ignore 'self', so the worker needs its own directive.
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    // No upgrade-insecure-requests: HSTS already pins production to https, and
    // the directive breaks a production build served over plain http (CI, a LAN till).
  };
  return Object.entries(directives)
    .map(([k, v]) => (v.length ? `${k} ${v.join(" ")}` : k))
    .join("; ");
}

/** 128 random bits, base64. Works in the Edge runtime (no Buffer). */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
