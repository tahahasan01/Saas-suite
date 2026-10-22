import { expect, test } from "@playwright/test";
import { API, ready } from "./helpers";

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

test.describe("invoices v2", () => {
  test("raise an invoice with lines, approve it, take part payment and download it", async ({ page, request }) => {
    const name = `E2E Billing ${uniq()}`;
    const res = await request.post(`${API}/contacts`, { data: { kind: "company", name, force: true } });
    expect(res.ok()).toBeTruthy();

    await page.goto("/invoices");
    await ready(page);
    await page.getByRole("button", { name: "New invoice" }).click();
    const form = page.getByRole("dialog", { name: "New invoice" });
    await form.getByLabel("Bill to").fill(name.slice(0, 14));
    await form.getByRole("button", { name: new RegExp(name) }).click();
    await form.getByLabel("Description").fill("Annual maintenance");
    await form.getByLabel("Qty").fill("2");
    await form.getByLabel("Price (PKR)").fill("5000");
    await form.getByRole("combobox", { name: /^Sales tax/ }).selectOption("gst_standard");
    await form.getByRole("button", { name: "Send for approval" }).click();

    // The new invoice opens: 2 x 5,000 + 18% = 11,800, awaiting approval, no number yet.
    const sheet = page.getByRole("dialog", { name: new RegExp(name) });
    await expect(sheet).toContainText("Awaiting approval");
    await expect(sheet).toContainText("11,800");
    await expect(sheet.getByRole("note")).toContainText(/Gazette/);   // seeded rates are unverified

    await sheet.getByRole("button", { name: "Approve" }).click();
    const confirm = page.getByRole("alertdialog", { name: /approve this invoice/i })
      .or(page.getByRole("dialog", { name: /approve this invoice/i }));
    await confirm.getByRole("button", { name: "Approve" }).click();
    await expect(sheet).toContainText(/INV-\d{4}-\d{2}-\d{5}/);

    await sheet.getByRole("button", { name: "Record payment" }).click();
    await sheet.getByLabel("Amount (PKR)").fill("4000");
    await sheet.getByRole("button", { name: "Save payment" }).click();
    await expect(sheet).toContainText("Part paid");
    await expect(sheet.getByText("Balance due").locator("..")).toContainText("7,800");

    const pdf = sheet.getByRole("link", { name: /Download PDF/ });
    const href = await pdf.getAttribute("href");
    expect(href).toContain("/pdf");
    const file = await page.request.get(href!);
    expect(file.headers()["content-type"]).toContain("application/pdf");
  });

  test("the overdue filter lists only invoices past their due date", async ({ page }) => {
    await page.goto("/invoices");
    await ready(page);
    await page.getByRole("tab", { name: "Overdue" }).click();
    await expect(page.getByRole("tab", { name: "Overdue" })).toHaveAttribute("aria-selected", "true");
    // Either the empty state, or every invoice row carries the overdue badge.
    const empty = page.getByText("No invoices here yet");
    const opens = page.getByRole("main").getByRole("button", { name: /^Open/ });
    await expect(empty.or(opens.first())).toBeVisible();
    for (const open of await opens.all()) {
      await expect(page.getByRole("row").filter({ has: open })).toContainText("Overdue");
    }
  });
});
