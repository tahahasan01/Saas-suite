import { expect, test } from "@playwright/test";

/* Table service set-up (wave B, P22/P23): turn the module on, add a floor
 * with tables 1-3, add a kitchen station that makes one category, and see
 * the tables on the floor view. */
test("a restaurant sets up a floor, its tables and a kitchen station", async ({ page, request }) => {
  const on = await request.post("/api/platform/modules/restaurant/enable");
  test.skip(!on.ok(), "needs POS turned on");
  const tag = Date.now().toString(36);
  const category = await (await request.post("/api/pos/categories", { data: { name: `Karahi ${tag}` } })).json();

  await page.goto("/restaurant/setup");
  const floors = page.getByRole("form", { name: "Add a floor" });
  await expect(floors).toBeVisible({ timeout: 15_000 });
  await floors.getByLabel("Floor name").fill(`Hall ${tag}`);
  await floors.getByRole("button", { name: "Add floor" }).click();

  const floor = page.getByRole("region", { name: `Hall ${tag}` });
  await floor.getByLabel("Table numbers").fill("1-3");
  await floor.getByRole("button", { name: "Add tables" }).click();
  await expect(floor.getByRole("list", { name: "Tables" }).getByRole("listitem")).toHaveCount(3);

  const stations = page.getByRole("form", { name: "Add a station" });
  await stations.getByLabel("Station name").fill(`Kitchen ${tag}`);
  await stations.getByRole("checkbox", { name: category.name }).check();
  await stations.getByRole("button", { name: "Add station" }).click();
  const station = page.getByRole("list", { name: "Stations" }).getByRole("listitem").filter({ hasText: `Kitchen ${tag}` });
  await expect(station).toContainText(category.name);

  await page.goto("/restaurant");
  await page.getByRole("tab", { name: `Hall ${tag}` }).click();
  const tables = page.getByRole("list", { name: `Tables on Hall ${tag}` });
  await expect(tables.getByRole("listitem")).toHaveCount(3);
  await expect(tables).toContainText("Free");
});
