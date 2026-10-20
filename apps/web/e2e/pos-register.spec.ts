import { expect, test } from "@playwright/test";
import { cart, products, scan, scanField } from "./helpers";

test.describe("POS register: scanning", () => {
  test("a fast scan after a narrowed search adds the scanned product, not the first search hit", async ({ page, request }) => {
    const all = await products(request);
    const lays = all.find((p) => /lays/i.test(p.name))!;
    const target = all.find((p) => p.barcode && p.id !== lays.id)!;
    await page.goto("/pos");
    await scanField(page).fill("lays");
    await expect(page.getByRole("button", { name: new RegExp(target.name) })).toHaveCount(0);
    await scanField(page).fill("");
    await scanField(page).focus();
    await scan(page, target.barcode!);
    await expect(cart(page)).toContainText(target.name);
    await expect(cart(page)).not.toContainText(lays.name);
  });

  test("tapping a product then scanning adds the scanned product too", async ({ page, request, browserName }) => {
    // WebKit runs the till noticeably slower under a parallel run; same steps, more time.
    test.slow(browserName === "webkit");
    const all = await products(request);
    const first = all[0];
    const target = all.find((p, i) => i > 0 && p.barcode)!;
    await page.goto("/pos");
    await page.getByRole("button", { name: new RegExp(first.name) }).first().click();
    await scan(page, target.barcode!);
    await expect(page.getByRole("heading", { name: "Cart (2)" })).toBeVisible();
    await expect(cart(page)).toContainText(target.name);
  });

  test("an unknown barcode adds nothing", async ({ page }) => {
    await page.goto("/pos");
    await scanField(page).focus();
    await scan(page, "0000000000000");
    await page.waitForTimeout(400);
    await expect(page.getByRole("heading", { name: "Cart (0)" })).toBeVisible();
  });

  test("after a sale, New sale puts the cursor back in the scan field, and Escape also closes the receipt", async ({ page, request, browserName }) => {
    test.slow(browserName === "webkit");
    const [first] = await products(request);
    await page.goto("/pos");
    await page.getByRole("button", { name: new RegExp(first.name) }).first().click();
    await page.getByRole("button", { name: /^Charge/ }).first().click();
    const receipt = page.getByRole("dialog");
    await expect(receipt).toBeVisible();
    await page.getByRole("button", { name: /new sale/i }).click();
    await expect(scanField(page)).toBeFocused();

    await page.getByRole("button", { name: new RegExp(first.name) }).first().click();
    await page.getByRole("button", { name: /^Charge/ }).first().click();
    await expect(receipt).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(receipt).toBeHidden();
    await expect(scanField(page)).toBeFocused();
  });

  test("the cart can be cleared by touch, without F1", async ({ page, request }) => {
    const [first] = await products(request);
    await page.goto("/pos");
    await page.getByRole("button", { name: new RegExp(first.name) }).first().click();
    await page.getByRole("button", { name: /clear cart/i }).first().click();
    await expect(page.getByRole("heading", { name: "Cart (0)" })).toBeVisible();
  });
});

for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
  test.describe(`POS register at ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, hasTouch: true });

    test("Charge is on screen without scrolling once an item is in the cart", async ({ page, request }) => {
      const [first] = await products(request);
      await page.goto("/pos");
      await page.getByRole("button", { name: new RegExp(first.name) }).first().tap();
      await expect(page.getByRole("button", { name: /^Charge/ }).first()).toBeInViewport();
    });

    test("cart quantity buttons are at least 44px and name their product", async ({ page, request }) => {
      const [first] = await products(request);
      await page.goto("/pos");
      await page.getByRole("button", { name: new RegExp(first.name) }).first().tap();
      // On small screens the cart may live in a sheet; open it if there is a cart bar.
      const bar = page.getByRole("button", { name: /view cart|open cart/i });
      if (await bar.count()) await bar.first().tap();
      const plus = page.getByRole("button", { name: new RegExp(`increase.*${first.name}`, "i") }).first();
      const box = await plus.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    });
  });
}
