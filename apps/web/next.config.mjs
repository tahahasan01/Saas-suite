import path from "path";
import { fileURLToPath } from "url";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Every response (07 S9). The CSP is per request, since it carries a nonce:
// middleware.ts + lib/csp.ts. e2e/security-headers.spec.ts checks what a
// browser actually receives.
const SECURITY_HEADERS = [
  // Two years, subdomains, preload-ready. Browsers ignore it over plain http, so dev is unaffected.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // camera=(self): the till's camera scan fallback (F19). usb=(self): the WebUSB receipt printer
  // (lib/printer.ts); usb=() had blocked it. Both still ask the user. The rest stay off.
  // geolocation=(self): the staff punch reads the browser's location for the server-side geofence (D-43).
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), payment=(), usb=(self), geolocation=(self)" },
];

/** @type {(phase: string) => import('next').NextConfig} */
export default function nextConfig(phase) {
  // Where /api/* goes (D-51: the browser only ever talks to its own origin).
  // Read when the server starts in dev, and baked in by `next build` — so a
  // production build must be told; it never guesses localhost. In production
  // the edge proxy should route /api/* to the API itself (no extra hop through
  // Next); this rewrite is then only the fallback.
  let apiOrigin = process.env.API_ORIGIN ?? (phase === PHASE_DEVELOPMENT_SERVER ? "http://localhost:4000" : "");
  if (!apiOrigin) {
    if (phase === PHASE_PRODUCTION_BUILD) {
      throw new Error("API_ORIGIN must be set for a production build (e.g. http://api:4000 inside compose).");
    }
    // `next start` serves the rewrites recorded at build time (routes-manifest);
    // this value is never used for routing, it only keeps the config loadable.
    apiOrigin = "http://api-origin-was-set-at-build.invalid";
  }

  return {
    reactStrictMode: true,
    // A self-contained server (server.js + traced node_modules) for the
    // production image: apps/web/Dockerfile (gate I2).
    output: "standalone",
    transpilePackages: ["@business-os/types", "@business-os/api-client"],
    // Pin the monorepo root so Next doesn't infer the home-dir lockfile as root.
    outputFileTracingRoot: path.join(__dirname, "../.."),
    // CI runs `eslint .` as its own step; don't lint twice inside the build.
    eslint: { ignoreDuringBuilds: true },
    poweredByHeader: false,
    async rewrites() {
      return [{ source: "/api/:path*", destination: `${apiOrigin.replace(/\/$/, "")}/:path*` }];
    },
    async headers() {
      // CSP is per request (it carries a nonce), so middleware.ts sets it.
      return [
        { source: "/:path*", headers: SECURITY_HEADERS },
        // frame-ancestors 'none' in the CSP is the modern form; this covers old
        // browsers. Not on web forms (/f/…), which businesses embed in an iframe.
        { source: "/((?!f/).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
        // The customer's quote page (wave D): the link's token is in the path, so
        // it must not leak through a Referer header, a cache or a search engine.
        // The marketing confirmation link (/c/{token}) carries its signature in the path too.
        { source: "/c/:path*", headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ] },
        { source: "/q/:path*", headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ] },
      ];
    },
  };
}
