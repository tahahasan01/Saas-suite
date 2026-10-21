import { expect, test } from "@playwright/test";
import { ready } from "./helpers";

// Settings → Company (3A): profile, branding with a real logo upload through
// the files API, document numbers and the unverified-tax-rate warning.

// A 4x4 teal PNG (made with Pillow; the API re-encodes it, so it must decode).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAE0lEQVR4nGPkL8tjgAEmOAsvBwAwGwD70cNmNQAAAABJRU5ErkJggg==",
  "base64",
);

test.describe.configure({ mode: "serial" });

test("company details save and survive a reload", async ({ page }) => {
  await page.goto("/settings/company");
  await ready(page);
  await expect(page.getByRole("heading", { name: "Company", exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Legal name (as registered)").fill("E2E Traders (Pvt) Ltd");
  await page.getByLabel("NTN").fill("1234567-8");
  await page.getByLabel("City").fill("Lahore");
  await page.getByLabel("Province").selectOption("PB");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Company details saved")).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await ready(page);
  await expect(page.getByLabel("Legal name (as registered)")).toHaveValue("E2E Traders (Pvt) Ltd");
  await expect(page.getByLabel("NTN")).toHaveValue("1234567-8");
  await expect(page.getByLabel("Province")).toHaveValue("PB");
});

test("a malformed NTN is refused with a reason", async ({ page }) => {
  await page.goto("/settings/company");
  await ready(page);
  await page.getByLabel("NTN").fill("12ab");
  await page.getByRole("button", { name: "Save details" }).click();
  // Said under the form (and in a toast); the words, not a code.
  await expect(page.locator("form p[role=alert]")).toHaveText(/^NTN is 7 digits/, { timeout: 15_000 });
});

test("a logo uploads, shows, and can be removed", async ({ page }) => {
  await page.goto("/settings/company");
  await ready(page);
  await page.getByTestId("logo-input").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Logo updated")).toBeVisible({ timeout: 15_000 });
  const logo = page.getByRole("img", { name: "Your logo" });
  await expect(logo).toBeVisible({ timeout: 15_000 });
  // Loaded for real: /api/files/{id} redirected to a signed link that served the bytes.
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("No logo")).toBeVisible({ timeout: 15_000 });
});

test("brand colours and receipt text save", async ({ page }) => {
  await page.goto("/settings/company");
  await ready(page);
  await page.getByLabel("Main colour hex code").fill("#1d4ed8");
  await page.getByLabel("Receipt footer").fill("Shukriya! Exchange within 7 days.");
  await page.getByRole("button", { name: "Save branding" }).click();
  await expect(page.getByText("Branding saved")).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await ready(page);
  await expect(page.getByLabel("Main colour hex code")).toHaveValue("#1d4ed8");
  await expect(page.getByLabel("Receipt footer")).toHaveValue("Shukriya! Exchange within 7 days.");
});

test("tax rates show, with a warning while any is unverified", async ({ page }) => {
  await page.goto("/settings/company");
  await ready(page);
  await expect(page.getByText("Some rates are pending verification")).toBeVisible({ timeout: 15_000 });
  const gst = page.getByRole("row").filter({ hasText: "Sales tax (standard)" });
  await expect(gst).toContainText("18%");
  await expect(gst).toContainText("Unverified");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the company page fits the screen", async ({ page }) => {
    await page.goto("/settings/company");
    await ready(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
