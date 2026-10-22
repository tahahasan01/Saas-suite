import { expect, test } from "@playwright/test";

/* F28, first slice: the dashboard's overview comes with the page (fetched by
 * the server page with the caller's cookie), so the browser doesn't ask for
 * it again after the session loads. */
test("the dashboard arrives with its data: no second request from the browser", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/dashboard/overview")) asked.push(r.url()); });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 15_000 });
  expect(asked).toEqual([]);
});
