import { expect, test } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { products } from "./helpers";

/* The offline till (3D): set up once while online, sell with the network
 * gone (receipt numbered <REG>-<DEV>-NNNNNN), and the sale reaches the
 * server by itself when the network is back. */
test.describe.configure({ mode: "serial" });

test("a registered till sells offline and syncs when the network is back", async ({ page, context, request }) => {
  const code = "E" + randomBytes(2).toString("hex").toUpperCase().slice(0, 3);
  await page.goto("/pos/drawer");
  await page.getByLabel("Till code").fill(code);
  await page.getByRole("button", { name: "Use this browser as a till" }).click();
  await expect(page.getByText("This till can now sell offline.")).toBeVisible({ timeout: 15_000 });
  const tillName = await page.locator("span.font-mono", { hasText: `-${code}` }).first().innerText();

  const [first] = await products(request);
  await page.goto("/pos");
  const pill = page.getByRole("status").filter({ hasText: /^(Online|Offline|Can't reach)/ });
  await expect(pill).toContainText("Online", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: new RegExp(first.name) }).first()).toBeVisible();

  await context.setOffline(true);
  await expect(pill).toContainText("Offline");
  await page.getByRole("button", { name: new RegExp(first.name) }).first().click();
  await page.getByRole("button", { name: /^Charge/ }).first().click();
  const receipt = page.getByRole("dialog", { name: "Sale complete" });
  await expect(receipt).toBeVisible();
  const ref = await receipt.getByText(new RegExp(`^${tillName}-\\d{6}$`)).innerText();
  await page.getByRole("button", { name: /new sale/i }).click();
  await expect(pill).toContainText("1 waiting");

  await context.setOffline(false);
  await expect(pill).not.toContainText("waiting", { timeout: 20_000 });
  await expect(pill).toContainText("Online");
  const found = await (await request.get(`/api/pos/sales?q=${encodeURIComponent(ref)}`)).json();
  expect(JSON.stringify(found)).toContain(ref);
});

test("a second tab of the till is view-only, and takes over when the first closes", async ({ context }) => {
  const first = await context.newPage();
  await first.goto("/pos");
  await expect(first.getByRole("button", { name: /^Charge/ }).first()).toBeVisible();
  const second = await context.newPage();
  await second.goto("/pos");
  await expect(second.getByRole("alert").filter({ hasText: "already open in another tab" }).first()).toBeVisible();
  await expect(first.getByText("already open in another tab")).toHaveCount(0);
  await first.close();
  await expect(second.getByText("already open in another tab")).toHaveCount(0, { timeout: 10_000 });
});
