import { expect, test } from "@playwright/test";
import { staff, staffPage } from "./helpers";

/* Provident fund (0113): HR turns the fund on, enrols a staff member from
 * their profile and records the balance they bring over; the staff member
 * sees their fund on their own login. */
test("HR enrols a staff member who then sees their own fund", async ({ browser, page }) => {
  const who = staff();
  test.skip(!who, "needs the staff login (run the API with mail going to Mailpit)");
  const note = `Brought over ${Date.now().toString(36)}`;

  await page.goto("/hrms/payroll/setup");
  await page.getByRole("tab", { name: "Pay policies" }).click({ timeout: 15_000 });
  const form = page.getByRole("form", { name: "Pay policies" });
  const fund = form.getByRole("switch", { name: "This company runs a provident fund" });
  if ((await fund.getAttribute("aria-checked")) !== "true") await fund.click();
  await form.getByLabel("Employee pays (%)").fill("8.33");
  await form.getByLabel("Company pays (%)").fill("8.33");
  await form.getByRole("button", { name: "Save pay policies" }).click();
  await expect(page.getByText("Pay policies saved")).toBeVisible();

  await page.goto(`/hrms/employees/${who!.id}`);
  const card = page.getByRole("region", { name: "Provident fund" });
  const add = card.getByRole("button", { name: "Add to the fund" });
  await expect(add.or(card.getByRole("button", { name: "End membership" }))).toBeVisible({ timeout: 15_000 });
  if (await add.isVisible()) {
    await card.getByLabel("Member from").fill("2024-01-01");
    await add.click();
    await expect(page.getByText("Added to the provident fund")).toBeVisible();
  }
  const entry = card.getByRole("form", { name: "Record a fund entry" });
  await entry.getByLabel("Entry").selectOption("opening");
  await entry.getByLabel("Employee share (PKR)").fill("50000");
  await entry.getByLabel("Company share (PKR)").fill("40000");
  await entry.getByLabel("Note").fill(note);
  await entry.getByRole("button", { name: "Record entry" }).click();
  await expect(page.getByText("Entry recorded")).toBeVisible();
  await expect(card.getByRole("list", { name: "Fund history" })).toContainText(note);

  const me = (await staffPage(browser))!;
  await me.goto("/me");
  await me.getByRole("link", { name: "My provident fund →" }).click({ timeout: 15_000 });
  await expect(me.getByRole("heading", { name: "My provident fund" })).toBeVisible({ timeout: 15_000 });
  await expect(me.getByRole("list", { name: "Fund history" })).toContainText(note);
  await expect(me.getByText("You paid in")).toBeVisible();
  await me.context().close();
});

/* The fund report lists each approved run's contributions; with no run
 * picked it asks for one. */
test("the provident fund report is on HR reports", async ({ page }) => {
  await page.goto("/hrms/reports");
  await page.getByRole("tab", { name: "Provident fund" }).click({ timeout: 15_000 });
  await expect(page.getByLabel("Payroll run")).toBeVisible();
});
