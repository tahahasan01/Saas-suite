import { expect, test } from "@playwright/test";
import { staff, staffPage } from "./helpers";

/* HR letters (wave C, H17/H37): a staff member asks for an experience letter
 * on their own login; HR issues it from Staff > Letters (filled in from the
 * template, numbered); the staff member can download it. */
test("a requested letter is issued from a template and reaches the employee", async ({ browser, page }) => {
  const who = staff();
  test.skip(!who, "needs the staff login (run the API with mail going to Mailpit)");
  const purpose = `Bank loan ${Date.now().toString(36)}`;

  const me = (await staffPage(browser))!;
  await me.goto("/me/letters");
  const ask = me.getByRole("form", { name: "Ask for a letter" });
  await ask.getByLabel("I need").selectOption("experience", { timeout: 15_000 });
  await ask.getByLabel("What for").fill(purpose);
  await ask.getByRole("button", { name: "Send request" }).click();
  await expect(me.getByRole("list", { name: "My letter requests" })).toContainText("waiting");

  await page.goto("/hrms/letters");
  const row = page.getByRole("list", { name: "Letter requests" }).getByRole("listitem").filter({ hasText: purpose });
  await row.getByRole("button", { name: `Issue letter for ${who!.name}` }).click({ timeout: 15_000 });
  const d = page.getByRole("dialog", { name: `Issue a letter to ${who!.name}` });
  await expect(d.getByLabel("Text (edit for this person if needed)")).toHaveValue(new RegExp(who!.name));
  await d.getByRole("button", { name: "Issue" }).click();
  await expect(d.getByRole("status")).toContainText(/Issued as HR-\d{4}-\d{4}/);
  await d.getByRole("button", { name: "Done" }).click();

  await me.reload();
  await expect(me.getByRole("list", { name: "My letter requests" })).toContainText("issued");
  await expect(me.getByRole("list", { name: "My letters" })).toContainText("Experience certificate");
  await expect(me.getByRole("list", { name: "My letters" }).getByRole("link", { name: "Download" }).first()).toBeVisible();
  await me.context().close();
});
