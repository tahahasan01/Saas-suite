import { expect, test } from "@playwright/test";
import { products } from "./helpers";

/* The touch tile screen (wave B, P42): coloured category tiles, a favourites
 * page and big tiles. The pinned product is unpinned afterwards so other
 * specs see the usual till. */
test("the till shows coloured category tiles, favourites and big tiles", async ({ page, request }) => {
  const list = await products(request);
  test.skip(list.length === 0, "needs POS with sample products");
  const tag = Date.now().toString(36);
  const cat = await (await request.post("/api/pos/categories", { data: { name: `Cold drinks ${tag}`, color: "blue" } })).json();
  const item = list[0];
  await request.patch(`/api/pos/products/${item.id}`, { data: { category_id: cat.id, pinned: true } });
  try {
    await page.goto("/pos");
    await expect(page.getByRole("heading", { name: "Favourites" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: new RegExp(item.name) }).first()).toBeVisible();

    const tiles = page.getByRole("group", { name: "Categories" });
    const tile = tiles.getByRole("button", { name: new RegExp(`Cold drinks ${tag}`) });
    await expect(tile).toHaveAttribute("style", /--tile-blue-bg/);
    await tile.click();
    await expect(tile).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: `Cold drinks ${tag}` })).toBeVisible();

    await tiles.getByRole("button", { name: "All items" }).click();
    await expect(page.getByRole("heading", { name: "All items" })).toBeVisible();

    const big = page.getByRole("button", { name: "Big tiles" });
    await big.click();
    await expect(big).toHaveAttribute("aria-pressed", "true");
    await big.click();      // back to normal for the next spec on this device
  } finally {
    await request.patch(`/api/pos/products/${item.id}`, { data: { pinned: false } });
  }
});

test("a manager sets category colours on the products page", async ({ page, request }) => {
  const tag = Date.now().toString(36);
  const cat = await (await request.post("/api/pos/categories", { data: { name: `Sweets ${tag}` } })).json();
  await page.goto("/pos/products");
  await page.getByRole("button", { name: "Tile colours" }).click({ timeout: 20_000 });
  const dialog = page.getByRole("dialog", { name: "Category colours on the till" });
  await dialog.getByLabel(`Colour of Sweets ${tag}`).selectOption("pink");
  await expect.poll(async () => {
    const all = await (await request.get("/api/pos/categories")).json();
    return all.find((c: { id: string }) => c.id === cat.id)?.color;
  }).toBe("pink");
});
