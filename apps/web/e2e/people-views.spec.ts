import { expect, test } from "@playwright/test";
import { API } from "./helpers";

/* Org chart and celebrations (wave A, H2/H20). */
test("the org chart nests a report under their manager", async ({ page, request }) => {
  const staff = await (await request.get(`${API}/hrms/employees`)).json();
  test.skip(!Array.isArray(staff) || staff.length < 2, "needs two employees");
  const [boss, report] = staff;
  const r = await request.patch(`${API}/hrms/employees/${report.id}/job`, { data: { manager_id: boss.id } });
  expect(r.ok(), await r.text()).toBeTruthy();
  await page.goto("/hrms/org-chart");
  const chart = page.getByRole("list", { name: "Org chart" });
  await expect(chart).toBeVisible({ timeout: 15_000 });
  const bossItem = chart.getByRole("listitem").filter({ has: page.getByRole("link", { name: new RegExp(`^${boss.name}`) }) }).first();
  await expect(bossItem).toContainText(report.name);
  await page.getByLabel("Find someone").fill(report.name);
  await expect(chart).toContainText(boss.name);           // a match keeps its managers above it
});

test("a birthday set on the profile shows on the Team page without the year", async ({ page, request }) => {
  const staff = await (await request.get(`${API}/hrms/employees`)).json();
  test.skip(!Array.isArray(staff) || staff.length === 0, "needs an employee");
  const person = staff[0];
  const d = new Date(Date.now() + 2 * 86_400_000);
  const dob = `1990-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  await page.goto(`/hrms/employees/${person.id}`);
  const field = page.getByLabel("Date of birth (for birthdays; the year is never shown)");
  await expect(field).toBeVisible({ timeout: 15_000 });
  await field.fill(dob);
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Saved")).toBeVisible();
  await page.goto("/hrms");
  const list = page.getByRole("list", { name: "Celebrations" });
  await expect(list).toContainText(`${person.name} birthday`, { timeout: 15_000 });
  await expect(list).not.toContainText("1990");
});
