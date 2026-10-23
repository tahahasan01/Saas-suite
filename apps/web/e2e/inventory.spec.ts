import { expect, test } from "@playwright/test";

/* Stock per branch, transfers and counts (wave B, 0091–0093): add a
 * warehouse in Settings, send it stock, receive with one short, then count
 * the main shop and apply the count. */
test("a warehouse is added, stock is sent and received short, and a count is applied", async ({ page, request }) => {
  const tag = Date.now().toString(36).slice(-5).toUpperCase();
  const product = await (await request.post("/api/pos/products", {
    data: { name: `Basmati ${tag}`, price_minor: 90_000, stock_qty: 20, track_stock: true },
  })).json();
  test.skip(!product.id, "needs POS");

  // 1. A warehouse, from Settings › Company.
  await page.goto("/settings/company");
  const add = page.getByRole("form", { name: "Add a branch or warehouse" });
  await add.getByLabel("Code").fill(`W${tag}`.slice(0, 8), { timeout: 20_000 });
  await add.getByLabel("Name").fill(`Warehouse ${tag}`);
  await add.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("list", { name: "Branches" })).toContainText(`Warehouse ${tag}`);

  // 2. A transfer of 5 from the main shop to it.
  await page.goto("/pos/transfers");
  await page.getByRole("button", { name: "New transfer" }).click({ timeout: 20_000 });
  const dlg = page.getByRole("dialog", { name: "New transfer" });
  await dlg.getByLabel("To").selectOption({ label: `Warehouse ${tag}` });
  await dlg.getByRole("combobox", { name: "Product 1" }).fill(`Basmati ${tag}`);
  await page.getByRole("option", { name: new RegExp(`Basmati ${tag}`) }).first().click();
  await dlg.getByLabel("Quantity").fill("5");
  await dlg.getByRole("button", { name: "Save draft" }).click();
  const item = page.getByRole("list", { name: "Transfers" }).getByRole("listitem").filter({ hasText: `Basmati ${tag}` });
  await expect(item).toContainText("Draft");
  await item.getByRole("button", { name: /^Dispatch / }).click();
  await expect(item).toContainText("On the way");

  // 3. Received with one short.
  await item.getByRole("button", { name: /^Receive / }).click();
  const recv = page.getByRole("dialog", { name: /^Receive TR-/ });
  await recv.getByLabel(new RegExp(`Basmati ${tag}`)).fill("4");
  await recv.getByRole("button", { name: "Receive" }).click();
  await expect(item).toContainText("Received");
  await expect(item).toContainText("1 short");

  // 4. Count the main shop: 13 on the shelf where the system says 15.
  await page.goto("/pos/counts");
  await page.getByRole("form", { name: "Start a count" }).getByRole("button", { name: "Start a count" }).click({ timeout: 20_000 });
  const count = page.getByRole("region", { name: /^Count at / }).first();
  await count.getByLabel(`Counted Basmati ${tag}`).fill("13");
  await count.getByRole("button", { name: `Save count of Basmati ${tag}` }).click();
  await expect(count.getByRole("list", { name: "Counted" })).toContainText("-2");
  await count.getByRole("button", { name: "Apply count" }).click();
  await page.getByRole("dialog", { name: "Apply this count?" }).getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("region", { name: "Past counts" })).toContainText("Applied");

  const levels = await (await request.get(`/api/pos/stock?product_id=${product.id}`)).json() as { branch_name: string; qty: number }[];
  expect(Object.fromEntries(levels.map((l) => [l.branch_name, l.qty]))).toMatchObject({ [`Warehouse ${tag}`]: 4 });
  expect(levels.find((l) => l.branch_name !== `Warehouse ${tag}`)?.qty).toBe(13);
});
