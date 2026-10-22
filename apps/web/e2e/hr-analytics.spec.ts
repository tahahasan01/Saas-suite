import { expect, test } from "@playwright/test";
import { API } from "./helpers";

/* HR analytics (wave C, H39): someone leaving this month shows as a leaver,
 * with the reason, on Staff > Reports. */
test("staff numbers show joiners, leavers and why they left", async ({ page, request }) => {
  const r = await request.post(`${API}/hrms/employees`, { data: { name: `Counted ${Date.now().toString(36)}`, join_date: "2024-04-01" } });
  test.skip(!r.ok(), "needs Staff turned on");
  const { id } = (await r.json()) as { id: string };
  const today = new Date().toISOString().slice(0, 10);
  expect((await request.post(`${API}/hrms/employees/${id}/offboarding`, { data: { reason: "retired", last_working_day: today } })).ok()).toBeTruthy();

  await page.goto("/hrms/reports");
  const section = page.getByRole("region", { name: "Staff numbers, last 12 months" });
  await expect(section).toBeVisible({ timeout: 15_000 });
  await expect(section.getByRole("table", { name: "Staff by month" })).toBeVisible();
  await expect(section.getByRole("list", { name: "Leaving reasons" })).toContainText("Retired");
});
