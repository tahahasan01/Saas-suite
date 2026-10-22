import { expect, test } from "@playwright/test";
import { API } from "./helpers";

/* One request tracker (wave A, H16): a pending leave request shows on
 * Approvals with a link to where it's decided. */
test("a pending leave request waits on Approvals with a way to decide it", async ({ page, request }) => {
  const staff = await (await request.get(`${API}/hrms/employees`)).json();
  test.skip(!Array.isArray(staff) || staff.length === 0, "needs Staff turned on with an employee");
  const reason = `Approval probe ${Date.now().toString(36)}`;
  // A random day well ahead: reruns must not overlap an earlier run's request.
  const d = new Date(Date.now() + (60 + Math.floor(Math.random() * 600)) * 86_400_000);
  d.setUTCDate(d.getUTCDate() + ((3 - d.getUTCDay() + 7) % 7));   // a Wednesday: never a weekly day off
  const day = d.toISOString().slice(0, 10);
  const res = await request.post(`${API}/hrms/leave`, {
    data: { employee_id: staff[0].id, request_type: "wfh", from_date: day, to_date: day, reason },
  });
  expect(res.ok(), await res.text()).toBeTruthy();

  await page.goto("/hrms/approvals");
  const row = page.getByRole("list", { name: "Waiting for a decision" }).getByRole("listitem").filter({ hasText: reason });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText(staff[0].name);
  await row.getByRole("link", { name: "Decide →" }).click();
  await expect(page).toHaveURL(/\/hrms\/leave/, { timeout: 20_000 });
});
