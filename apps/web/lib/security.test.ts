import { describe, expect, it } from "vitest";
import { buildCsp, newNonce } from "./csp";
import { safeNext } from "./redirect";
import { isAppRoute } from "./routes";

const directive = (csp: string, name: string) =>
  csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `) || d === name);

describe("CSP", () => {
  for (const dev of [false, true]) {
    it(`never allows inline scripts without the nonce (${dev ? "dev" : "production"})`, () => {
      const csp = buildCsp("abc123", { dev });
      const scripts = directive(csp, "script-src")!;
      expect(scripts).toContain("'nonce-abc123'");
      expect(scripts).toContain("'strict-dynamic'");
      expect(scripts).not.toContain("'unsafe-inline'");
      expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
      expect(directive(csp, "object-src")).toBe("object-src 'none'");
    });
  }

  it("allows eval only in dev (React Refresh) and the HMR websocket only in dev", () => {
    expect(directive(buildCsp("n", { dev: true }), "script-src")).toContain("'unsafe-eval'");
    expect(directive(buildCsp("n", { dev: false }), "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(buildCsp("n", { dev: true }), "connect-src")).toContain("ws:");
    expect(directive(buildCsp("n", { dev: false }), "connect-src")).toBe("connect-src 'self'");
  });

  it("adds configured connect-src origins (e.g. Sentry)", () => {
    expect(directive(buildCsp("n", { dev: false, connectSrc: ["https://o1.ingest.sentry.io"] }), "connect-src"))
      .toBe("connect-src 'self' https://o1.ingest.sentry.io");
  });

  it("makes a fresh 128-bit nonce each time", () => {
    const a = newNonce();
    expect(atob(a)).toHaveLength(16);
    expect(newNonce()).not.toBe(a);
  });
});

describe("safeNext (no open redirect after login)", () => {
  it.each([
    ["/pos/products?q=dawn", "/pos/products?q=dawn"],
    [null, "/dashboard"],
    ["https://evil.example", "/dashboard"],
    ["//evil.example/x", "/dashboard"],
    ["/\\evil.example", "/dashboard"],
    ["/login?next=/x", "/dashboard"],
    ["/pos\n", "/dashboard"],
  ])("%s -> %s", (raw, want) => expect(safeNext(raw)).toBe(want));
});

describe("isAppRoute (middleware gate)", () => {
  it("covers the signed-in app and nothing public", () => {
    for (const p of ["/dashboard", "/pos", "/pos/products", "/hrms/payroll", "/me/leave", "/settings/fbr", "/crm", "/invoices", "/automations"]) {
      expect(isAppRoute(p)).toBe(true);
    }
    for (const p of ["/", "/login", "/signup", "/pricing", "/verify", "/reset", "/accept-invite", "/forgot", "/posters"]) {
      expect(isAppRoute(p)).toBe(false);
    }
  });
});
