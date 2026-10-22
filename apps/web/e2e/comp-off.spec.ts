import { expect, test } from "@playwright/test";
import { API, staff, staffPage } from "./helpers";

/** A past Sunday a few weeks back, so each run uses a fresh one. */
function pastSunday(): string {
  const d = new Date(Date.now() - (14 + Math.floor(Math.random() * 200)) * 86_400_000);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

/* Comp-off and encashment (wave C, H8): the staff member worked a Sunday
 * (punches from a device log), asks for a day back on My leave, HR approves
 * it into casual leave; then HR encashes a day from the profile. */
test("a worked Sunday becomes a comp-off day, and leave is encashed", async ({ browser, page, request }) => {
  const who = staff();
  test.skip(!who, "needs the staff login (run the API with mail going to Mailpit)");
  const code = String(90000 + Math.floor(Math.random() * 9000));
  expect((await request.patch(`${API}/hrms/employees/${who!.id}/job`, { data: { code } })).ok()).toBeTruthy();
  const sunday = pastSunday();
  const csv = `AC-No.,Time,State\n${code},${sunday} 10:00:00,C/In\n${code},${sunday} 16:00:00,C/Out\n`;
  expect((await request.post(`${API}/hrms/attendance/import`, { data: csv, headers: { "Content-Type": "text/csv" } })).ok()).toBeTruthy();

  const me = (await staffPage(browser))!;
  await me.goto("/me/leave");
  const ask = me.getByRole("form", { name: "Ask for comp-off" });
  await ask.getByLabel("Day you worked").fill(sunday, { timeout: 15_000 });
  await ask.getByLabel("Why you worked").fill("Stock count");
  await ask.getByRole("button", { name: "Ask for comp-off" }).click();
  await expect(me.getByRole("list", { name: "My comp-off requests" })).toContainText("pending");

  await page.goto("/hrms/leave");
  await page.getByRole("button", { name: `Approve comp-off for ${who!.name}` }).first().click({ timeout: 15_000 });
  await expect(page.getByText("Comp-off added to their balance")).toBeVisible();
  await me.reload();
  await expect(me.getByRole("list", { name: "My comp-off requests" })).toContainText("approved");
  await me.context().close();

  await page.goto(`/hrms/employees/${who!.id}`);
  await page.getByRole("button", { name: "Encash leave" }).click({ timeout: 15_000 });
  const d = page.getByRole("dialog", { name: "Encash leave" });
  await d.getByLabel("Days").fill("1");
  await d.getByRole("button", { name: "Encash" }).click();
  await expect(d.getByRole("status")).toContainText("1 day(s) encashed");
});
