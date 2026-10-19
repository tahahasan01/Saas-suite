import { expect, test } from "@playwright/test";

// Every page, at every size we support, must fit the screen: tables scroll
// inside their card or turn into cards; side panels wrap below the content.
const ROUTES = [
  "/dashboard", "/crm", "/invoices", "/automations",
  "/pos", "/pos/products", "/pos/returns", "/pos/drawer", "/pos/purchase-orders", "/pos/insights",
  "/hrms", "/hrms/attendance", "/hrms/leave", "/hrms/holidays", "/hrms/payroll",
  "/settings/team", "/settings/sections", "/settings/billing", "/settings/fbr",
  "/", "/pricing",
];
const SIZES = [
  { width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 },
  { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1366, height: 768 }, { width: 2560, height: 1440 },
];

for (const vp of SIZES) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });
    for (const route of ROUTES) {
      test(`${route} has no sideways scroll`, async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${route} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
      });
    }
  });
}

test.describe("staff list on a small phone", () => {
  test.use({ viewport: { width: 320, height: 568 } });
  test("employee names stay visible", async ({ page }) => {
    await page.goto("/hrms");
    const name = page.getByText("Ahmed Raza").first();
    await expect(name).toBeVisible();
    const box = await name.boundingBox();
    expect(box!.width).toBeGreaterThan(40);
  });
});

test.describe("ultrawide", () => {
  test.use({ viewport: { width: 2560, height: 1440 } });
  test("page content is capped to a readable width", async ({ page }) => {
    await page.goto("/dashboard");
    const w = await page.locator("main > *").first().evaluate((el) => el.getBoundingClientRect().width);
    expect(w).toBeLessThanOrEqual(1600);
  });
});

test.describe("phone forms", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("inputs are at least 16px so iOS does not zoom on focus", async ({ page }) => {
    await page.goto("/pos");
    const size = await page.getByPlaceholder(/scan barcode/i).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  });
});
