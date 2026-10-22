import { expect, test } from "@playwright/test";

/* Registers and sessions (3C): open, move cash, count every method, a big
 * difference needs a manager's PIN, then the Z-report. One flow, so serial:
 * it owns the default register's session while it runs. */
test.describe.configure({ mode: "serial" });

test("a register is opened, counted, approved by PIN and closed with a Z-report", async ({ page }) => {
  await page.goto("/pos/drawer");
  await expect(page.getByRole("heading", { name: "Your approval PIN" })).toBeVisible();

  await page.getByLabel("New PIN (6 digits)").fill("246813");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Your approval PIN is set")).toBeVisible();

  const openBtn = page.getByRole("button", { name: "Open register" });
  if (await openBtn.isVisible()) {
    await page.getByLabel("Opening float (PKR)").fill("1000");
    await openBtn.click();
  }
  await expect(page.getByText(/is open$/)).toBeVisible();

  await page.getByLabel("Cash move").selectOption("pay_in");
  await page.getByLabel("Amount (PKR)").fill("50");
  await page.getByLabel("Reason").fill("Float top-up");
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText("Cash move recorded")).toBeVisible();

  // Counting nothing leaves the whole float short: more than the register allows.
  for (const field of await page.getByLabel(/counted \(PKR\)$/).all()) await field.fill("0");
  await page.getByRole("button", { name: "Close & print Z-report" }).click();

  const prompt = page.getByRole("dialog", { name: "Manager approval" });
  await expect(prompt).toBeVisible();
  await prompt.getByLabel("Their PIN").fill("000000");
  await prompt.getByRole("button", { name: "Approve" }).click();
  await expect(prompt.getByRole("alert")).toBeVisible();
  await prompt.getByLabel("Their PIN").fill("246813");
  await prompt.getByRole("button", { name: "Approve" }).click();

  const z = page.getByRole("dialog", { name: "Z-report" });
  await expect(z).toBeVisible();
  await expect(z).toContainText("Net sales");
  await z.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Open register" })).toBeVisible();
});

test("the till's printer and paper width stay on this device", async ({ page }) => {
  await page.goto("/pos/drawer");
  await page.getByLabel("Paper").selectOption("58");
  await page.reload();
  await expect(page.getByLabel("Paper")).toHaveValue("58");
  await page.getByLabel("Paper").selectOption("80");
});
