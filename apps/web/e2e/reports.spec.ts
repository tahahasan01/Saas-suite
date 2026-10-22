import { expect, test } from "@playwright/test";

/* Reports (3G): every report reads on screen and downloads as CSV. */

test("POS reports switch between sales, tax and stock, and download as CSV", async ({ page }) => {
  await page.goto("/pos/reports");
  await expect(page.getByRole("tab", { name: "Sales by day" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("table", { name: "Sales by day" }).or(page.getByText("Nothing in this range."))).toBeVisible();

  for (const name of ["By item", "By cashier", "By payment method", "Tax summary", "Stock value"]) {
    await page.getByRole("tab", { name }).click();
    await expect(page.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
  }
  // Stock value has no range; its CSV is a real spreadsheet.
  await expect(page.getByLabel("From")).toHaveCount(0);
  const href = await page.getByRole("link", { name: "Download CSV" }).getAttribute("href");
  expect(href).toContain("format=csv");
  const r = await page.request.get(href!);
  expect(r.ok()).toBe(true);
  expect(r.headers()["content-type"]).toContain("text/csv");
  expect((await r.text()).split("\n")[0]).toContain("Product");
});

test("Staff reports show attendance for a range", async ({ page }) => {
  await page.goto("/hrms/reports");
  await expect(page.getByRole("tab", { name: "Attendance" })).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("From").fill("2026-01-01");
  const href = await page.getByRole("link", { name: "Download CSV" }).getAttribute("href");
  expect(href).toContain("from=2026-01-01");
  const r = await page.request.get(href!);
  expect((await r.text()).split("\n")[0]).toContain("Employee");
});
