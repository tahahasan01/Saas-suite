import { expect, test } from "@playwright/test";

// 07 S9: what a browser actually receives from the web server. The policy
// itself is unit-tested in lib/security.test.ts; this proves it's wired.

test.use({ storageState: { cookies: [], origins: [] } });

const directive = (csp: string, name: string) =>
  csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `) || d === name) ?? "";

for (const path of ["/login", "/"]) {
  test(`security headers on ${path}`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const h = res.headers();
    expect(h["strict-transport-security"]).toMatch(/max-age=\d{8,}/);
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-powered-by"]).toBeUndefined();
    // Own origin only: the till's camera scan (F19) and USB receipt printer; the rest stay off.
    expect(h["permissions-policy"]).toBe("camera=(self), microphone=(), payment=(), usb=(self), geolocation=(self)");

    const csp = h["content-security-policy"] ?? "";
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    const scripts = directive(csp, "script-src");
    expect(scripts).toMatch(/'nonce-[A-Za-z0-9+/=]{16,}'/);
    expect(scripts).not.toContain("'unsafe-inline'");
  });
}

test("a web form page may be framed by https sites (embedding); nothing else may", async ({ request }) => {
  const form = (await request.get("/f/any-public-id")).headers();
  expect(form["x-frame-options"]).toBeUndefined();
  expect(directive(form["content-security-policy"] ?? "", "frame-ancestors")).toBe("frame-ancestors https:");
  for (const path of ["/login", "/q/any-token", "/c/any-token"]) {
    const h = (await request.get(path)).headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(directive(h["content-security-policy"] ?? "", "frame-ancestors")).toBe("frame-ancestors 'none'");
  }
});

test("each response gets its own nonce, and the page's inline scripts carry it", async ({ request, page }) => {
  const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1];
  const a = nonceOf((await request.get("/login")).headers()["content-security-policy"] ?? "");
  const b = nonceOf((await request.get("/login")).headers()["content-security-policy"] ?? "");
  expect(a).toBeTruthy();
  expect(a).not.toBe(b);

  // No CSP violations while the page boots (Next's bootstrap + the theme script).
  const violations: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toMatch(/light|dark/); // theme script ran
});

test("app routes need a session cookie (middleware)", async ({ page }) => {
  await page.goto("/hrms/payroll?month=2026-01");
  await expect(page).toHaveURL(/\/login\?next=%2Fhrms%2Fpayroll%3Fmonth%3D2026-01$/);
});
