import { expect, test } from "@playwright/test";

/* Pay policies (0112): a company starts from a preset, then sets its own
 * rules (encashment rate, gratuity tax, what's paid out on leaving), and
 * they stay saved. */
test("a company applies a preset and then sets its own pay rules", async ({ page }) => {
  await page.goto("/hrms/payroll/setup");
  await page.getByRole("tab", { name: "Pay policies" }).click({ timeout: 15_000 });

  await page.getByRole("button", { name: "Use Factory or shop (Standing Orders)" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Use preset" }).click();
  await expect(page.getByText("Preset applied: check each rule below")).toBeVisible();
  const form = page.getByRole("form", { name: "Pay policies" });
  await expect(form.getByRole("switch", { name: "This company pays gratuity" })).toHaveAttribute("aria-checked", "true");

  await form.getByLabel("One day of leave is worth").selectOption("days_26");
  await form.getByLabel("Income tax on gratuity").selectOption("exempt_up_to");
  await form.getByLabel("Tax-free limit (PKR)").fill("100000");
  await form.getByLabel("Casual leave").check();
  await form.getByRole("button", { name: "Save pay policies" }).click();
  await expect(page.getByText("Pay policies saved")).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: "Pay policies" }).click({ timeout: 15_000 });
  const again = page.getByRole("form", { name: "Pay policies" });
  await expect(again.getByLabel("One day of leave is worth")).toHaveValue("days_26");
  await expect(again.getByLabel("Tax-free limit (PKR)")).toHaveValue("100000");
  await expect(again.getByLabel("Casual leave")).toBeChecked();
  await expect(page.getByRole("list", { name: "Presets" })).toContainText("in use");
});
