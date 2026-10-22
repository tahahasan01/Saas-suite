import { expect, test } from "@playwright/test";
import { API } from "./helpers";

/* Biometric import (wave A, H6): a device log uploaded on Attendance becomes
 * punches; the same file again adds nothing. */
test("a device log is imported once, and again adds nothing", async ({ page, request }) => {
  const staff = await (await request.get(`${API}/hrms/employees`)).json();
  test.skip(!Array.isArray(staff) || staff.length === 0, "needs an employee");
  const code = String(50000 + Math.floor(Math.random() * 40000));
  const r = await request.patch(`${API}/hrms/employees/${staff[0].id}/job`, { data: { code } });
  expect(r.ok(), await r.text()).toBeTruthy();
  const day = new Date(Date.now() - (20 + Math.floor(Math.random() * 300)) * 86_400_000).toISOString().slice(0, 10);
  const csv = Buffer.from(`AC-No.,Time,State\n${code},${day} 09:05:00,C/In\n${code},${day} 17:40:00,C/Out\n`);

  await page.goto("/hrms/attendance");
  const form = page.getByRole("form", { name: "Import a device log" });
  await expect(form).toBeVisible({ timeout: 15_000 });
  await form.getByLabel("Attendance log (CSV)").setInputFiles({ name: "log.csv", mimeType: "text/csv", buffer: csv });
  await form.getByRole("button", { name: "Import" }).click();
  await expect(page.getByRole("status").filter({ hasText: "imported" })).toContainText("2 punches imported");

  await form.getByLabel("Attendance log (CSV)").setInputFiles({ name: "log.csv", mimeType: "text/csv", buffer: csv });
  await form.getByRole("button", { name: "Import" }).click();
  await expect(page.getByRole("status").filter({ hasText: "imported" })).toContainText("0 punches imported, 2 already there");
});
