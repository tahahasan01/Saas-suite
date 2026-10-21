import { expect, test } from "@playwright/test";
import { API, ready } from "./helpers";

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

test.describe("catalog v2", () => {
  test("a product gets a category, a stock adjustment and a carton barcode that scans 12", async ({ page, request }) => {
    const name = `E2E Catalog ${uniq()}`;
    const carton = `9${Date.now().toString().slice(-11)}`;
    await page.goto("/pos/products");
    await ready(page);
    const add = page.getByRole("form").or(page.locator("form").filter({ has: page.getByRole("button", { name: /^Add / }) })).last();
    await add.getByLabel("Name", { exact: true }).fill(name);
    await add.getByLabel("Price (PKR)").fill("250");
    await add.getByLabel("Stock", { exact: true }).fill("40");
    await add.getByLabel("Category", { exact: true }).fill("E2E Shelf");
    await add.getByRole("button", { name: /^Add / }).click();

    await page.getByLabel(/^Search/).fill(name);
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("E2E Shelf");

    await row.getByRole("button", { name: `Stock of ${name}` }).click();
    const stock = page.getByRole("dialog", { name: `Stock of ${name}` });
    await stock.getByRole("textbox", { name: /^Quantity/ }).or(stock.getByLabel(/^Quantity/)).fill("3");
    await stock.getByRole("button", { name: "Save adjustment" }).click();
    await expect(stock.getByRole("listitem").filter({ hasText: "Damaged or lost" })).toContainText("-3");
    await page.keyboard.press("Escape");
    await expect(row).toContainText("37");

    await row.getByRole("button", { name: `Barcodes of ${name}` }).click();
    const codes = page.getByRole("dialog", { name: `Barcodes of ${name}` });
    await codes.getByLabel("Barcode").fill(carton);
    await codes.getByRole("button", { name: "Add barcode" }).click();
    await expect(codes.getByRole("listitem").filter({ hasText: carton })).toContainText("scans as 12");

    const scanned = await (await request.get(`${API}/pos/products/lookup?barcode=${carton}`)).json();
    expect(scanned.name).toBe(name);
    expect(scanned.scan_qty).toBe(12);
  });
});
