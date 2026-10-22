import { expect, test } from "@playwright/test";
import { products } from "./helpers";

/* Cashier = employee (3C, pos_hrms): pick yourself from a searchable list,
 * enter your PIN, and your sales carry your name. */
test.describe.configure({ mode: "serial" });

test("a cashier signs in at the till with their PIN, sells, and signs out", async ({ page, request }) => {
  const staff = await (await request.get("/api/hrms/employees")).json();
  test.skip(!Array.isArray(staff) || staff.length === 0, "needs Staff turned on with an employee");
  const emp = staff[0];
  expect((await request.put(`/api/hrms/employees/${emp.id}/kiosk-pin`, { data: { pin: "2468" } })).status()).toBe(204);

  await page.goto("/pos");
  await page.getByRole("button", { name: "Cashier sign-in" }).click();
  const dialog = page.getByRole("dialog", { name: "Cashier sign-in" });
  const who = dialog.getByRole("combobox", { name: "Who's on the till" });
  await who.fill(emp.name.slice(0, 3));
  await expect(dialog.getByRole("option", { name: emp.name })).toBeVisible();
  await who.press("ArrowDown");
  await who.press("ArrowUp");
  await dialog.getByRole("option", { name: emp.name }).click();
  await expect(who).toHaveValue(emp.name);

  await dialog.getByLabel("PIN").fill("1111");
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByLabel("PIN").fill("2468");
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(emp.name, { exact: true }).first()).toBeVisible();

  const [first] = await products(request);
  await page.getByRole("button", { name: new RegExp(first.name) }).first().click();
  await page.getByRole("button", { name: /^Charge/ }).first().click();
  await expect(page.getByRole("dialog", { name: "Sale complete" })).toBeVisible();
  await page.getByRole("button", { name: /new sale/i }).click();

  await page.getByRole("button", { name: `Cashier ${emp.name}` }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Cashier sign-in" })).toBeVisible();
});
