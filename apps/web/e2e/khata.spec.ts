import { expect, test } from "@playwright/test";
import { API, products, ready } from "./helpers";

test.describe("khata", () => {
  test("a credit sale shows on the customer's account and a payment takes it down", async ({ page, request }) => {
    const name = `E2E Khata ${Date.now().toString(36)}`;
    const contact = await (await request.post(`${API}/contacts`, { data: { name, force: true } })).json();
    const [p] = await products(request);
    const sale = await request.post(`${API}/pos/sales`, {
      data: { items: [{ product_id: p.id, qty: 2 }], payment_method: "khata", contact_id: contact.id },
    });
    expect(sale.ok()).toBeTruthy();
    const owed = (await sale.json()).total_minor as number;

    await page.goto("/pos/khata");
    await ready(page);
    const row = page.getByRole("row").filter({ hasText: name });
    await row.getByRole("button", { name: /^Open/ }).click();
    const sheet = page.getByRole("dialog", { name: new RegExp(name) });
    await expect(sheet).toContainText("Bought on khata");
    await sheet.getByLabel("Amount (PKR)").fill(String(owed / 200));     // half of it
    await sheet.getByRole("button", { name: "Record payment" }).click();
    await expect(sheet.getByRole("listitem").first()).toContainText("Paid");
  });
});
