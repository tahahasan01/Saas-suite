import { expect, test } from "@playwright/test";

/* Assets issued to staff (wave A, H22): add one, issue it, take it back
 * damaged, and see that in its history and on the employee's profile. */
test("an asset is added, issued, taken back damaged, and its history kept", async ({ page, request }) => {
  const staff = await (await request.get("/api/hrms/employees")).json();
  test.skip(!Array.isArray(staff) || staff.length === 0, "needs Staff turned on with an employee");
  const person = staff[0] as { id: string; name: string };
  const name = `Laptop ${Date.now().toString(36)}`;

  await page.goto("/hrms/assets");
  const form = page.getByRole("form", { name: "Add an asset" });
  await expect(form).toBeVisible({ timeout: 15_000 });
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Value (PKR)").fill("150000");
  await form.getByRole("button", { name: "Add asset" }).click();
  const row = page.getByRole("list", { name: "Assets" }).getByRole("listitem").filter({ hasText: name });
  await expect(row).toContainText("available");

  await row.getByRole("button", { name: `Issue ${name}` }).click();
  const issue = page.getByRole("dialog", { name: `Issue ${name}` });
  await issue.getByRole("combobox", { name: "To" }).fill(person.name);
  await page.getByRole("option", { name: person.name }).first().click();
  await issue.getByRole("button", { name: "Issue" }).click();
  await expect(row).toContainText(`with ${person.name}`);

  await page.goto(`/hrms/employees/${person.id}`);
  await expect(page.getByRole("list", { name: "Assets held" })).toContainText(name, { timeout: 15_000 });

  await page.goto("/hrms/assets");
  await row.getByRole("button", { name: `Take back ${name}` }).click();
  const back = page.getByRole("dialog", { name: `Take back ${name}` });
  await back.getByLabel("Condition now").selectOption("damaged");
  await back.getByRole("button", { name: "Take back" }).click();
  await expect(row).toContainText("Damaged");
  await row.getByRole("button", { name: `History of ${name}` }).click();
  await expect(page.getByRole("list", { name: "Asset history" })).toContainText("back damaged");
});
