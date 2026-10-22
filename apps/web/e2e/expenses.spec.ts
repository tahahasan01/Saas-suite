import { expect, test } from "@playwright/test";
import { staff, staffPage } from "./helpers";

/* Expense claims (wave C, H13): a staff member claims on their own login with
 * a receipt; HR approves part of it, which queues it for the next salary,
 * and the staff member sees that. */
test("a staff member's claim is approved and queued for their salary", async ({ browser, page }) => {
  const who = staff();
  test.skip(!who, "needs the staff login (run the API with mail going to Mailpit)");
  const title = `Client visit ${Date.now().toString(36)}`;

  const me = (await staffPage(browser))!;
  await me.goto("/me/expenses");
  await me.getByRole("button", { name: "New expense claim" }).click({ timeout: 15_000 });
  const form = me.getByRole("form", { name: "New expense claim" });
  await form.getByLabel("What for").fill(title);
  await form.getByLabel("Type").selectOption("fuel");
  await form.getByLabel("Amount 1 (PKR)").fill("4500");
  await form.getByLabel("Receipt (photo or PDF)").setInputFiles({
    name: "fuel.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"),
  });
  await form.getByRole("button", { name: "Add a line" }).click();
  await form.getByLabel("Amount 2 (PKR)").fill("1500");
  await expect(form).toContainText("Total Rs 6,000");
  await form.getByRole("button", { name: "Send claim" }).click();
  const mine = me.getByRole("list", { name: "My claims" }).getByRole("listitem").filter({ hasText: title });
  await expect(mine).toContainText("waiting");
  await expect(mine.getByRole("link", { name: "Receipt" })).toBeVisible();

  await page.goto("/hrms/expenses");
  await page.getByRole("list", { name: "Expense claims" }).getByRole("button", { name: new RegExp(title) }).click({ timeout: 15_000 });
  const d = page.getByRole("dialog", { name: `${who!.name}: ${title}` });
  await d.getByLabel("Approve (PKR)").fill("5000");
  await d.getByLabel("Note (needed to reject)").fill("Second line over the limit");
  await d.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved: it's paid with the next salary")).toBeVisible();

  await me.reload();
  await expect(mine).toContainText("approved, paid with");
  await expect(mine).toContainText("of Rs 6,000");
  await me.context().close();
});
