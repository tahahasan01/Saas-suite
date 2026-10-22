import { expect, test, type APIRequestContext } from "@playwright/test";
import { API } from "./helpers";

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function freshLead(request: APIRequestContext) {
  const res = await request.post(`${API}/crm/leads`, {
    data: { name: `Selling ${uid()}`, source: "manual", value_minor: 1_000_000, force: true },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

test.describe("products on a deal", () => {
  test("lines picked from the catalog price the deal and set its value", async ({ page, request }) => {
    const productName = `Solar panel ${uid()}`;
    const made = await request.post(`${API}/pos/products`, { data: { name: productName, price_minor: 25_000_00 } });
    expect(made.ok()).toBeTruthy();
    const lead = await freshLead(request);

    await page.goto("/crm");
    await page.getByRole("main").getByRole("button", { name: `Open ${lead.name}` }).click();
    const drawer = page.getByRole("dialog", { name: lead.name });
    const products = drawer.getByRole("region", { name: "Products" });
    await products.getByRole("button", { name: "Add products" }).click();

    await products.getByLabel("Find a product").fill(productName.slice(0, 18));
    await products.getByRole("list", { name: "Matching products" }).getByRole("button", { name: new RegExp(productName) }).click();
    await products.getByLabel("Qty").first().fill("2");
    await products.getByRole("button", { name: "Add a line" }).click();
    await products.getByLabel("Line 2").fill("Installation");
    await products.getByLabel("Price (PKR)").nth(1).fill("5000");
    await products.getByRole("button", { name: "Save products" }).click();

    await expect(page.getByText("Products saved")).toBeVisible();
    await expect(products.getByText(productName)).toBeVisible();
    await expect(products.getByText("Installation")).toBeVisible();
    // 2 × 25,000 + 5,000, no tax: the deal is now worth 55,000.
    await expect(products.locator("dd").last()).toHaveText(/55,000/);
    await expect(drawer.getByText("Value", { exact: true }).locator("..")).toContainText("55,000");

    // The value is no longer typed by hand.
    await drawer.getByRole("button", { name: "Edit details" }).click();
    await expect(drawer.getByLabel("Value (PKR)")).toBeDisabled();
  });
});
