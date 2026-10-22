import { expect, test } from "@playwright/test";

/* Notice board (wave A, H18/H19), HR's side: post a policy, see who still has
 * to acknowledge it, archive it. The employee's side (/me/notices) is covered
 * by tests/hrms/test_notices.py; e2e has no employee login yet. */
test("HR posts a policy, sees who hasn't acknowledged, and archives it", async ({ page, request }) => {
  const staff = await (await request.get("/api/hrms/employees")).json();
  test.skip(!Array.isArray(staff) || staff.length === 0, "needs Staff turned on with an employee");
  const title = `Leave policy ${Date.now().toString(36)}`;

  await page.goto("/hrms/notices");
  const form = page.getByRole("form", { name: "Post a notice" });
  await expect(form).toBeVisible({ timeout: 15_000 });
  await form.getByLabel("Title").fill(title);
  await form.getByLabel("Message").fill("Apply for leave three days ahead.");
  await form.getByLabel("Staff must read and acknowledge it (a policy)").check();
  await form.getByRole("button", { name: "Post notice" }).click();

  const card = page.getByRole("list", { name: "Notices" }).getByRole("listitem").filter({ hasText: title });
  await expect(card).toContainText(/0 of \d+ acknowledged/);
  await card.getByRole("button", { name: `Who acknowledged ${title}` }).click();
  const dialog = page.getByRole("dialog", { name: `Who acknowledged “${title}”` });
  await expect(dialog.getByRole("list", { name: "Acknowledgements" })).toContainText("not yet");
  await page.keyboard.press("Escape");

  await card.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("list", { name: "Notices" }).getByRole("listitem").filter({ hasText: title })).toHaveCount(0);
});
