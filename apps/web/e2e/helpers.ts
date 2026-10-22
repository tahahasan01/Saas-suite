import { existsSync, readFileSync } from "node:fs";
import { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";

/** The API itself, for test setup through `request` (not what the page calls). */
export const API = process.env.API_URL ?? "http://localhost:4000";

/** A page.route() matcher for one API path, however the page reaches it: the
 *  same-origin `/api` rewrite (current) or the API's own origin (older builds). */
export const apiPath = (path: string) => (url: URL) =>
  url.pathname === `/api${path}` || (url.origin === new URL(API).origin && url.pathname === path);

/** Waits until a page shows its real content, so layout checks measure it.
 *
 *  networkidle alone isn't enough: it can fire while the app shell still says
 *  "Loading…" (no session yet) or a page still shows skeletons, and an
 *  overflow check then measures an empty screen and passes. App pages are
 *  ready once the shell's #main is up and no `.animate-pulse` skeleton is left.
 *  Public pages (/, /pricing) have no shell (and the landing page no <main>):
 *  pass `{ shell: false }` and they're ready once their heading is up. */
export async function ready(page: Page, { shell = true }: { shell?: boolean } = {}) {
  if (shell) await expect(page.locator("#main")).toBeVisible({ timeout: 20_000 });
  else await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 20_000 });
  // Web fonts change text widths, so measure with the final ones.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Late chunks and images, best-effort only: under a parallel run Firefox
  // counts the dev server's HMR websocket upgrade as an open request until it
  // completes (seen taking 25s+), so networkidle can outlast the test. The
  // checks above are what make the page measurable.
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
}

export type Product = { id: string; name: string; barcode: string | null; price_minor: number };

export async function products(request: APIRequestContext): Promise<Product[]> {
  const res = await request.get(`${API}/pos/products`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/** The cart panel: the container holding the "Cart (n)" heading. */
export function cart(page: Page) {
  return page.getByRole("heading", { name: /^Cart \(\d+\)$/ }).locator("..");
}

export function scanField(page: Page) {
  return page.getByPlaceholder(/scan barcode/i);
}

/** Types like a keyboard-wedge scanner: the whole code plus Enter in well under the search debounce. */
export async function scan(page: Page, code: string) {
  await page.keyboard.type(code, { delay: 4 });
  await page.keyboard.press("Enter");
}

/** The staff member with their own portal login that global setup made
 *  through the invite flow, or null when the API wasn't sending mail to
 *  Mailpit (then specs that need it skip). */
export function staff(): { id: string; name: string; state: string } | null {
  const info = "e2e/.auth/employee-info.json";
  const state = "e2e/.auth/employee.json";
  if (!existsSync(info) || !existsSync(state)) return null;
  return { ...(JSON.parse(readFileSync(info, "utf8")) as { id: string; name: string }), state };
}

/** A page signed in as that staff member. */
export async function staffPage(browser: Browser): Promise<Page | null> {
  const s = staff();
  if (!s) return null;
  const ctx = await browser.newContext({ storageState: s.state, baseURL: process.env.WEB_URL ?? "http://localhost:3000" });
  return ctx.newPage();
}
