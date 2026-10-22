import { expect, test } from "@playwright/test";
import { API } from "./helpers";

/* Final settlement (wave C, H12): a leaver shows under Payroll > Leavers;
 * the settlement is worked out, a notice-pay line added, and approval books
 * it on the exit month's payroll. */
test("a leaver's settlement is worked out and booked on payroll", async ({ page, request }) => {
  const r = await request.post(`${API}/hrms/employees`, { data: { name: `Leaving ${Date.now().toString(36)}`, join_date: "2023-02-01", salary_minor: 5_000_000 } });
  test.skip(!r.ok(), "needs Staff turned on");
  const person = (await r.json()) as { id: string; name: string };
  const last = new Date().toISOString().slice(0, 10);
  expect((await request.post(`${API}/hrms/employees/${person.id}/offboarding`, { data: { reason: "resigned", last_working_day: last } })).ok()).toBeTruthy();

  await page.goto("/hrms/payroll/settlements");
  await page.getByRole("button", { name: `Start settlement for ${person.name}` }).click({ timeout: 15_000 });
  const d = page.getByRole("dialog", { name: `Final settlement: ${person.name}` });
  await expect(d.getByRole("list", { name: "Payables" })).toBeVisible();

  const add = d.getByRole("form", { name: "Add a line" });
  await add.getByLabel("Amount (PKR)").fill("25000");
  await add.getByRole("button", { name: "Add" }).click();
  await expect(d.getByRole("list", { name: "Payables" })).toContainText("Notice pay");
  await expect(d.getByRole("list", { name: "Payables" })).toContainText("Rs 25,000");

  await d.getByRole("button", { name: "Approve and book on payroll" }).click();
  await expect(d.getByRole("status").filter({ hasText: "Booked on the" })).toContainText("payroll: it's paid when that run is");
  await expect(d.getByRole("button", { name: `Remove Notice pay` })).toHaveCount(0);
});
