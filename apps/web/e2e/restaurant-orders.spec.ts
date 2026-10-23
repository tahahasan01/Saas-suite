import { expect, test } from "@playwright/test";

/* Restaurant orders and kitchen tickets (wave B, P22/P23/P40): open a free
 * table, tap items in with a note, send to the kitchen (a ticket per
 * station), add one more and send only that, then void one with a reason. */
test("a table is opened, items go to the kitchen in rounds, and a sent item is voided", async ({ page, request }) => {
  const on = await request.post("/api/platform/modules/restaurant/enable");
  test.skip(!on.ok(), "needs POS turned on");
  const tag = Date.now().toString(36).slice(-5);
  const cat = await (await request.post("/api/pos/categories", { data: { name: `BBQ ${tag}`, color: "red" } })).json();
  await request.post("/api/restaurant/stations", { data: { name: `Grill ${tag}`, category_ids: [cat.id] } });
  const dish = await (await request.post("/api/pos/products", {
    data: { name: `Seekh kebab ${tag}`, price_minor: 120_000, category_id: cat.id, track_stock: false },
  })).json();
  const floor = await (await request.post("/api/restaurant/floors", { data: { name: `Lawn ${tag}` } })).json();
  await request.post(`/api/restaurant/floors/${floor.id}/tables`, { data: { labels: ["7"] } });

  // Open table 7 for three.
  await page.goto("/restaurant");
  await page.getByRole("tab", { name: `Lawn ${tag}` }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Table 7, free" }).click();
  const open = page.getByRole("dialog", { name: "Open table 7" });
  await open.getByLabel("Guests").fill("3");
  await open.getByRole("button", { name: "Open" }).click();
  await expect(page.getByRole("heading", { name: "Table 7" })).toBeVisible({ timeout: 20_000 });

  // Two kebabs, one note, then to the kitchen.
  const menu = page.getByRole("group", { name: "Menu items" });
  await menu.getByRole("button", { name: new RegExp(`Seekh kebab ${tag}`) }).click();
  const lines = page.getByRole("list", { name: "Order lines" });
  await expect(lines).toContainText(`Seekh kebab ${tag}`);
  await page.getByRole("button", { name: `One more Seekh kebab ${tag}` }).click();
  await expect(page.getByLabel(`Seekh kebab ${tag} quantity`)).toHaveText("2");
  const note = page.getByLabel(`Note for Seekh kebab ${tag}`);
  await note.fill("well done");
  await note.blur();
  await page.getByRole("button", { name: "Send to kitchen" }).click();
  const tickets = page.getByRole("region", { name: "Kitchen tickets" });
  await expect(tickets).toContainText(`Grill ${tag}`);
  await expect(tickets).toContainText(`2 × Seekh kebab ${tag} (well done)`);

  // One more: only that goes.
  await page.getByRole("button", { name: `One more Seekh kebab ${tag}` }).click();
  await page.getByRole("button", { name: "Send to kitchen" }).click();
  await expect(tickets.getByRole("listitem").filter({ hasText: /^KOT/ }).first()).toContainText(`1 × Seekh kebab ${tag}`);

  // Void one the kitchen has: a reason, and a VOID ticket.
  await page.getByRole("button", { name: `Void Seekh kebab ${tag}` }).click();
  const v = page.getByRole("dialog", { name: `Void Seekh kebab ${tag}` });
  await v.getByLabel("Why").fill("Dropped on the way");
  await v.getByRole("button", { name: "Void" }).click();
  await expect(tickets).toContainText("VOID");
  await expect(tickets).toContainText("Why: Dropped on the way");
  await expect(page.getByLabel(`Seekh kebab ${tag} quantity`)).toHaveText("2");

  // The floor shows the table occupied with its running bill.
  await page.getByRole("link", { name: "Back to floor" }).click();
  await page.getByRole("tab", { name: `Lawn ${tag}` }).click();
  await expect(page.getByRole("link", { name: "Table 7, occupied" })).toContainText(/2,400/);
});
