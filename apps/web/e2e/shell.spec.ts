import { expect, test, type Page } from "@playwright/test";

// The app shell: navigation at each size, keyboard paths through it, and the
// settings that can do real damage with one slip.

const sidebar = (page: Page) => page.locator("aside[aria-label='Main navigation']").first();

test.describe("sidebar on a small laptop", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test("is an icon rail by default, keeps names, and can still be expanded", async ({ page }) => {
    await page.goto("/dashboard");
    const aside = sidebar(page);
    await expect(aside).toBeVisible();
    expect((await aside.boundingBox())!.width).toBeLessThanOrEqual(80);
    // Icon-only links still have names for screen readers and a tooltip.
    const payroll = aside.getByRole("link", { name: "Payroll" });
    await expect(payroll).toBeVisible();
    await expect(payroll).toHaveAttribute("title", "Payroll");

    // Keyboard rather than a click: in dev the Next.js badge sits over the
    // bottom-left corner where this button lives.
    await aside.getByRole("button", { name: "Expand sidebar" }).focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await aside.boundingBox())!.width).toBeGreaterThan(200);
  });
});

test.describe("sidebar on a desktop", () => {
  test.use({ viewport: { width: 1366, height: 768 } });
  test("is full width by default", async ({ page }) => {
    await page.goto("/dashboard");
    expect((await sidebar(page).boundingBox())!.width).toBeGreaterThan(200);
  });
});

test.describe("keyboard", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("the first Tab stop skips to the content", async ({ page, browserName }) => {
    await page.goto("/dashboard");
    await expect(page.locator("main#main")).toBeVisible();
    const skip = page.getByRole("link", { name: "Skip to content" });
    if (browserName === "webkit") {
      // Safari's Tab skips links unless "Press Tab to highlight each item" is
      // on (Option+Tab includes them on a Mac, but Playwright's WebKit on
      // Windows/Linux treats Alt+Tab as plain Tab, so no key reaches a link).
      // Prove the same two things another way: the link comes first in tab
      // order, and focusing it shows it.
      const first = await page.evaluate(() => {
        const all = document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]");
        const el = [...all].find((e) => e.tabIndex >= 0 && !(e as HTMLButtonElement).disabled && !e.closest("nextjs-portal"));
        return el?.textContent?.trim();
      });
      expect(first).toBe("Skip to content");
      await skip.focus();
      expect((await skip.boundingBox())!.width).toBeGreaterThan(40); // not sr-only any more
    } else {
      await page.keyboard.press("Tab");
      // In dev the Next.js overlay button can take the first stop; skip past it.
      if (await page.evaluate(() => document.activeElement?.tagName.toLowerCase() === "nextjs-portal")) {
        await page.keyboard.press("Tab");
      }
    }
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
  });

  test("the palette is a combobox, traps focus and hands it back", async ({ page }) => {
    await page.goto("/dashboard");
    const trigger = page.getByRole("button", { name: /go to/i });
    await trigger.click();
    const box = page.getByRole("combobox", { name: /search screens/i });
    await expect(box).toBeFocused();
    await expect(box).toHaveAttribute("aria-expanded", "true");
    const first = await box.getAttribute("aria-activedescendant");
    expect(first).toBeTruthy();
    await page.keyboard.press("ArrowDown");
    await expect(box).not.toHaveAttribute("aria-activedescendant", first!);
    await expect(page.getByRole("option").first()).toBeVisible();
    // Tab must not escape into the page behind it.
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(box).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("the notifications panel closes on Escape", async ({ page }) => {
    await page.goto("/dashboard");
    const bell = page.getByRole("button", { name: "Notifications" });
    await bell.click();
    await expect(bell).toHaveAttribute("aria-expanded", "true");
    const panel = page.getByRole("dialog", { name: /notifications/i });
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(bell).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("mobile menu", () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test("has a close button, closes on navigation and returns focus", async ({ page }) => {
    await page.goto("/dashboard");
    const btn = page.getByRole("button", { name: "Open menu" });
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await btn.click();
    const nav = page.getByRole("dialog", { name: /menu/i });
    await expect(nav).toBeVisible();
    // While the menu is modal the page behind it is aria-hidden, so find the
    // button by attribute rather than by role.
    await expect(page.locator("button[aria-label='Open menu']")).toHaveAttribute("aria-expanded", "true");
    await nav.getByRole("button", { name: /^close/i }).click();
    await expect(nav).toBeHidden();
    await expect(btn).toBeFocused();

    await btn.click();
    await nav.getByRole("link", { name: "Payroll" }).click();
    await expect(page).toHaveURL(/\/hrms\/payroll$/, { timeout: 15_000 }); // dev compiles on first visit
    await expect(nav).toBeHidden();
  });

  test("module tabs scroll the active tab into view", async ({ page }) => {
    await page.goto("/pos/insights");
    const tab = page.getByRole("navigation", { name: /sections/i }).getByRole("link", { name: "Insights" });
    await expect(tab).toBeInViewport({ ratio: 1 });
  });
});

test.describe("settings", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("FBR production needs an explicit confirmation", async ({ page }) => {
    await page.goto("/settings/fbr");
    const env = page.getByLabel("Environment");
    await expect(env).toHaveValue("sandbox");
    await env.selectOption("production");
    const confirm = page.getByRole("dialog", { name: /production/i });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText(/real invoices/i);
    await confirm.getByRole("button", { name: /cancel/i }).click();
    await expect(confirm).toBeHidden();
    await expect(env).toHaveValue("sandbox");
  });

  test("Enterprise 'Contact sales' is a real contact link", async ({ page }) => {
    await page.goto("/settings/billing");
    await expect(page.getByRole("link", { name: /contact sales/i })).toHaveAttribute("href", /^mailto:sales@/);
  });

  test("module switches announce what they control", async ({ page }) => {
    await page.goto("/settings/sections");
    await expect(page.getByRole("switch").first()).toHaveAccessibleName(/.+/);
  });
});

test.describe("billing", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("reopening the transfer details reuses the pending request", async ({ page }) => {
    let posts = 0;
    page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/billing/upgrade")) posts++; });
    await page.goto("/settings/billing");
    await page.getByRole("button", { name: "Choose Starter" }).click();
    const dialog = page.getByRole("dialog", { name: /bank transfer/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Copy account" })).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Show transfer details" }).click();
    await expect(dialog).toBeVisible();
    expect(posts).toBe(1);
  });
});
