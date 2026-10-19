import { expect, test } from "@playwright/test";

test.describe("overlays on a phone", () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test("the lead drawer can be closed with its close button and with Escape", async ({ page }) => {
    await page.goto("/crm");
    // Scoped to main: the top bar's "Open menu" also starts with "Open ".
    const card = page.getByRole("main").getByRole("button", { name: /^open /i }).first();
    await card.click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: /^close/i }).click(); // must not be covered by the top bar
    await expect(drawer).toBeHidden();

    await card.click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("the mobile menu closes on Escape and its button is a full-size target", async ({ page }) => {
    await page.goto("/dashboard");
    const btn = page.getByRole("button", { name: "Open menu" });
    const box = await btn.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(36);
    await btn.click();
    const nav = page.getByRole("dialog", { name: /menu/i });
    await expect(nav).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(nav).toBeHidden();
  });

  test("the notifications panel stays inside a 320px screen", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Notifications" }).click();
    const panel = page.getByRole("dialog", { name: /notifications/i });
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  });
});

test.describe("overlays on a landscape phone", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

  test("the new-lead form scrolls inside itself so Create can be reached", async ({ page }) => {
    await page.goto("/crm");
    await page.getByRole("button", { name: /^\+ New/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const create = dialog.getByRole("button", { name: /^create/i }).first();
    await create.scrollIntoViewIfNeeded();
    await expect(create).toBeInViewport();
  });
});
