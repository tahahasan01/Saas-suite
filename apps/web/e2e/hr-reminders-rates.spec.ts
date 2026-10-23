import { expect, test } from "@playwright/test";
import { API, staff } from "./helpers";

/* Wave A leftovers: HR reminds staff of a policy they haven't acknowledged
 * (0110), and sets overtime rates for days off and holidays (0109). */
test("HR reminds staff about an unacknowledged policy", async ({ page, request }) => {
  test.skip(!staff(), "needs the staff login, so someone can be reminded");
  const title = `Uniform policy ${Date.now().toString(36)}`;
  const r = await request.post(`${API}/hrms/notices`, { data: { title, body: "Wear the shirt", requires_ack: true } });
  expect(r.ok(), await r.text()).toBeTruthy();

  await page.goto("/hrms/notices");
  const card = page.getByRole("list", { name: "Notices" }).getByRole("listitem").filter({ hasText: title });
  await card.getByRole("button", { name: `Remind about ${title}` }).click({ timeout: 15_000 });
  await expect(page.getByText(/Reminded \d+ person/)).toBeVisible();
  await expect(card).toContainText("Reminded 1 time(s)");
});

test("overtime rates are set for days off and holidays", async ({ page }) => {
  await page.goto("/hrms/attendance");
  await page.getByText(/^Overtime rates:/).click({ timeout: 15_000 });
  const form = page.getByRole("form", { name: "Overtime rates" });
  await form.getByLabel("Public holiday").fill("3");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Overtime rates saved")).toBeVisible();
  await expect(page.getByText(/^Overtime rates:/)).toContainText("×3 holiday");
});
