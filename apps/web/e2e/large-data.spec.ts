import { expect, test, type Locator, type Page } from "@playwright/test";
import { API, cart, products, ready } from "./helpers";

// Runs only in the "large-data" project, against the tenant e2e/seed-large.ts
// filled with ~200 products, 60 long-named staff, 40 leads, 30 leave requests
// and invoices. Real shops have this much; the sample data hides layout bugs
// that only long names and Rs 1,234,567.89 prices show.
const LONG_EMP = "Muhammad Abdul Rehman Siddiqui";
const LONGEST_EMP = "Chaudhry Muhammad Usman Ghani Warraich";
const ROUTES = ["/dashboard", "/crm", "/invoices", "/pos", "/pos/products", "/pos/insights",
  "/hrms", "/hrms/attendance", "/hrms/leave", "/hrms/payroll"];
const SIZES = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }];

async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** Elements whose own text is cut off sideways (wider content than box, no scroller). */
async function clippedText(loc: Locator) {
  return loc.evaluateAll((els) =>
    els.filter((el) => {
      const s = getComputedStyle(el);
      if (s.overflowX === "auto" || s.overflowX === "scroll" || s.textOverflow === "ellipsis") return false;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return false;
      return el.scrollWidth - el.clientWidth > 1;
    }).map((el) => (el.textContent ?? "").trim().slice(0, 60)));
}

for (const vp of SIZES) {
  test.describe(`big data at ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });
    for (const route of ROUTES) {
      test(`${route} has no sideways scroll`, async ({ page }) => {
        await page.goto(route);
        await ready(page);
        const o = await overflow(page);
        expect(o, `${route} overflows by ${o}px`).toBeLessThanOrEqual(0);
      });
    }
  });
}

test.describe("POS with a 200-product catalog", () => {
  test("the grid shows the catalog quickly, and long names and big prices stay inside their tiles", async ({ page, request }) => {
    const all = await products(request);
    expect(all.length).toBeGreaterThanOrEqual(150);
    const t0 = Date.now();
    await page.goto("/pos");
    const tiles = page.locator("button:has(span.tabular-nums)").filter({ hasText: /in stock|Low stock|Out of stock/ });
    await expect(tiles.first()).toBeVisible();
    const firstTile = Date.now() - t0;
    await expect(tiles).toHaveCount(all.length);
    const allTiles = Date.now() - t0;
    test.info().annotations.push({ type: "perf", description: `POS: first tile ${firstTile} ms, ${all.length} tiles ${allTiles} ms after goto` });
    console.log(`[perf] POS first tile ${firstTile} ms, all ${all.length} tiles ${allTiles} ms`);
    expect(allTiles).toBeLessThan(10_000);

    const big = all.find((p) => p.price_minor === 123_456_789)!;
    const tile = tiles.filter({ hasText: big.name }).first();
    await expect(tile).toContainText("1,234,567.89");
    expect(await clippedText(tiles.locator("span"))).toEqual([]);
    // A long-named tile is no wider than its neighbours.
    const widths = await tiles.evaluateAll((els) => els.slice(0, 16).map((e) => Math.round(e.getBoundingClientRect().width)));
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(2);
  });

  test("a cart of big-ticket items totals correctly and fits the panel", async ({ page, request }) => {
    const all = await products(request);
    const pricey = all.filter((p) => p.price_minor >= 10_000_000 && (p as { stock_qty?: number }).stock_qty! > 0).slice(0, 5);
    expect(pricey.length).toBe(5);
    await page.goto("/pos");
    for (const p of pricey) await page.getByRole("button", { name: new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
    await expect(page.getByRole("heading", { name: "Cart (5)" })).toBeVisible();
    const panel = cart(page);
    for (const p of pricey) await expect(panel).toContainText(p.name.slice(0, 20));
    expect(await clippedText(panel.locator("*"))).toEqual([]);
    const box = await panel.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(1366);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test("on a phone the cart sheet with big totals fits the screen", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const all = await products(request);
    const pricey = all.filter((p) => p.price_minor >= 10_000_000 && (p as { stock_qty?: number }).stock_qty! > 0).slice(0, 3);
    await page.goto("/pos");
    for (const p of pricey) await page.getByRole("button", { name: new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath("pos-phone-big-cart.png"), fullPage: false });
  });
});

test.describe("payroll with 60+ staff", () => {
  for (const vp of [{ width: 320, height: 568 }, { width: 1366, height: 768 }]) {
    test(`every payslip renders and long names stay readable at ${vp.width}px`, async ({ page, request }) => {
      await page.setViewportSize(vp);
      const emps = await (await request.get(`${API}/hrms/employees`)).json();
      expect(emps.length).toBeGreaterThanOrEqual(60);
      const t0 = Date.now();
      await page.goto("/hrms/payroll");
      const name = page.getByText(LONGEST_EMP).locator("visible=true").first();
      await expect(name).toBeVisible({ timeout: 15_000 });
      console.log(`[perf] payroll (${emps.length} staff) visible ${Date.now() - t0} ms at ${vp.width}px`);
      await expect(page.getByText(LONG_EMP).locator("visible=true").first()).toBeVisible();
      // Long names wrap or truncate with an ellipsis — never cut off mid-glyph.
      const w = (await name.boundingBox())!.width;
      expect(w).toBeGreaterThan(60);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: test.info().outputPath(`payroll-${vp.width}.png`), fullPage: true });
    });
  }
});

test.describe("lists with long names", () => {
  test.use({ viewport: { width: 320, height: 568 } });
  test("staff list keeps long names visible on a small phone", async ({ page }) => {
    await page.goto("/hrms");
    const name = page.getByText(LONGEST_EMP).locator("visible=true").first();
    await expect(name).toBeVisible();
    expect((await name.boundingBox())!.width).toBeGreaterThan(60);
  });

  test("leave page lists the 30 requests without pushing the page sideways", async ({ page, request }) => {
    const leave = await (await request.get(`${API}/hrms/leave`)).json();
    expect(leave.length).toBeGreaterThanOrEqual(30);
    await page.goto("/hrms/leave");
    await expect(page.getByText(LONG_EMP).locator("visible=true").first()).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath("leave-320.png"), fullPage: true });
  });

  test("invoices with long lead names fit", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page.getByText(LONG_EMP).locator("visible=true").first()).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("catalog beyond 200 products", () => {
  // GET /pos/products used to stop at 200 rows and the Products page filtered
  // that capped list in the browser, so the 201st product onwards
  // (alphabetically) couldn't be found, edited or archived there. Now search
  // runs on the server and the page pages with "Load more".
  test("every product is reachable on the Products page", async ({ page, request }) => {
    const first = await request.get(`${API}/pos/products?limit=1`);
    expect(first.ok()).toBeTruthy();
    const total = Number(first.headers()["x-total-count"]);
    expect(total, "the seeded catalog should be bigger than one page").toBeGreaterThan(200);
    // The last product in list order: the one the old cap hid.
    const [last] = await (await request.get(`${API}/pos/products?limit=1&offset=${total - 1}`)).json();
    const edit = page.getByRole("button", { name: `Edit ${last.name}`, exact: true }).locator("visible=true");

    // "Showing 200 of 230 products", or "230 products" once all are loaded.
    const count = page.getByText(/^(Showing \d+ of \d+|\d+) [a-z ]+$/i);
    await page.goto("/pos/products");
    await ready(page);
    await expect(count).toHaveText(new RegExp(`^Showing 200 of ${total} `, "i"));
    await expect(edit).toHaveCount(0);

    // Found by searching…
    const search = page.getByRole("searchbox");
    await search.fill(last.name);
    await expect(edit).toBeVisible({ timeout: 10_000 });

    // …and by paging through the whole catalog.
    await search.fill("");
    await expect(count).toHaveText(new RegExp(`^Showing 200 of ${total} `, "i"), { timeout: 10_000 });
    const more = page.getByRole("button", { name: /^Load \d+ more$/ });
    while (await more.isVisible()) {
      const before = (await count.textContent()) ?? "";
      await more.click();
      await expect(count).not.toHaveText(before, { timeout: 10_000 });
    }
    await expect(count).toHaveText(new RegExp(`^${total} `, "i"));
    await expect(edit).toBeVisible();
  });
});
