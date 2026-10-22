import { expect, test } from "@playwright/test";
import { API, products, ready } from "./helpers";

test.describe("sales history", () => {
  test("a sale is found by its receipt number, reprinted as a duplicate and voided", async ({ page, request }) => {
    const [p] = await products(request);
    const res = await request.post(`${API}/pos/sales`, {
      data: { items: [{ product_id: p.id, qty: 1 }], payment_method: "card" },
    });
    expect(res.ok()).toBeTruthy();
    const sale = await res.json();
    expect(sale.receipt_no).toMatch(/^R1-\d{4}-\d{2}-\d{6}$/);
    // The first print was the till's.
    await request.post(`${API}/pos/sales/${sale.id}/print`);

    await page.goto("/pos/sales");
    await ready(page);
    await page.getByLabel("Search sales").fill(sale.receipt_no);
    const row = page.getByRole("row").filter({ hasText: sale.receipt_no });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: /^Open/ }).click();
    const receipt = page.getByRole("dialog", { name: "Sale" });
    await expect(receipt).toContainText(sale.receipt_no);
    await page.evaluate(() => { window.print = () => {}; });
    await receipt.getByRole("button", { name: "Print" }).click();
    await expect(receipt).toContainText("DUPLICATE");
    await receipt.getByRole("button", { name: "Close" }).last().click();

    await row.getByRole("button", { name: /^More actions for/ }).click();
    await page.getByRole("menuitem", { name: "Void sale" }).click();
    const confirm = page.getByRole("dialog", { name: /^Void/ });
    await confirm.getByLabel("Why").fill("Rang up twice");
    await confirm.getByRole("button", { name: "Void sale" }).click();
    await expect(row).toContainText("Void");
  });
});
