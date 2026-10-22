import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { products } from "./helpers";

/* Registers and sessions (3C): open, move cash, count every method, a big
 * difference needs a manager's PIN, then the Z-report. One flow, so serial:
 * it owns the default register's session while it runs. */
test.describe.configure({ mode: "serial" });

test("a register is opened, counted, approved by PIN and closed with a Z-report", async ({ page }) => {
  await page.goto("/pos/drawer");
  // Registers, then the open session, load in turn: give a cold API time.
  await expect(page.getByRole("heading", { name: "Your approval PIN" })).toBeVisible({ timeout: 15_000 });

  await page.getByLabel("New PIN (6 digits)").fill("246813");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Your approval PIN is set")).toBeVisible();

  const openBtn = page.getByRole("button", { name: "Open register" });
  if (await openBtn.isVisible()) {
    await page.getByLabel("Opening float (PKR)").fill("1000");
    await openBtn.click();
  }
  await expect(page.getByText(/is open$/)).toBeVisible();

  await page.getByLabel("Cash move").selectOption("pay_in");
  await page.getByLabel("Amount (PKR)").fill("50");
  await page.getByLabel("Reason").fill("Float top-up");
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText("Cash move recorded")).toBeVisible();

  // Counting nothing leaves the whole float short: more than the register allows.
  for (const field of await page.getByLabel(/counted \(PKR\)$/).all()) await field.fill("0");
  await page.getByRole("button", { name: "Close & print Z-report" }).click();

  const prompt = page.getByRole("dialog", { name: "Manager approval" });
  await expect(prompt).toBeVisible();
  await prompt.getByLabel("Their PIN").fill("000000");
  await prompt.getByRole("button", { name: "Approve" }).click();
  await expect(prompt.getByRole("alert")).toBeVisible();
  await prompt.getByLabel("Their PIN").fill("246813");
  await prompt.getByRole("button", { name: "Approve" }).click();

  const z = page.getByRole("dialog", { name: "Z-report" });
  await expect(z).toBeVisible();
  await expect(z).toContainText("Net sales");
  await z.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Open register" })).toBeVisible();
});

test("the till's printer and paper width stay on this device", async ({ page }) => {
  await page.goto("/pos/drawer");
  await page.getByLabel("Paper").selectOption("58");
  await page.reload();
  await expect(page.getByLabel("Paper")).toHaveValue("58");
  await page.getByLabel("Paper").selectOption("80");
});

/* Phase 3 exit check: one business day, end to end. Open the register, sell
 * online, go offline and sell, reload with the sale still waiting, reconnect
 * and see each sale on the server exactly once, take a return, close with a
 * Z-report, then run payroll and download a payslip. */
async function charge(page: Page, productName: string): Promise<string> {
  await page.getByRole("button", { name: new RegExp(productName) }).first().click();
  await page.getByRole("button", { name: /^Charge/ }).first().click();
  const receipt = page.getByRole("dialog", { name: "Sale complete" });
  await expect(receipt).toBeVisible({ timeout: 15_000 });
  const no = await receipt.getByText(/^[A-Z0-9]{1,6}-(\d{4}-\d{2}-\d{4,}|[A-Z0-9]{1,6}-\d{6})$/).first().innerText();
  await page.getByRole("button", { name: /new sale/i }).click();
  return no;
}

test("a business day: open, sell online and offline, reload, sync once, return, Z-report, payroll", async ({ page, context, request }) => {
  test.slow();
  // 1. Open the register (and set this manager's approval PIN for the close).
  await page.goto("/pos/drawer");
  await expect(page.getByRole("heading", { name: "Your approval PIN" })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("New PIN (6 digits)").fill("246813");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Your approval PIN is set")).toBeVisible();
  const openBtn = page.getByRole("button", { name: "Open register" });
  if (await openBtn.isVisible()) {
    await page.getByLabel("Opening float (PKR)").fill("1000");
    await openBtn.click();
  }
  await expect(page.getByText(/is open$/)).toBeVisible();
  // This browser becomes a till that can sell offline.
  const code = "D" + randomBytes(2).toString("hex").toUpperCase().slice(0, 3);
  await page.getByLabel("Till code").fill(code);
  await page.getByRole("button", { name: "Use this browser as a till" }).click();
  await expect(page.getByText("This till can now sell offline.")).toBeVisible({ timeout: 15_000 });

  // 2. Sell online.
  const [first] = (await products(request)).filter((p) => ((p as { stock_qty?: number }).stock_qty ?? 99) > 5);
  await page.goto("/pos");
  const pill = page.getByRole("status").filter({ hasText: /^(Online|Offline|Can't reach)/ });
  await expect(pill).toContainText("Online", { timeout: 15_000 });
  const online = await charge(page, first.name);

  // 3. Go offline and sell: the till numbers it itself.
  await context.setOffline(true);
  await expect(pill).toContainText("Offline");
  const offline = await charge(page, first.name);
  expect(offline).toContain(`-${code}-`);
  await expect(pill).toContainText("1 waiting");

  // 4. Reload with the sale still unsent (the sync endpoint held back): it survives in the outbox.
  await page.route("**/api/pos/sync/orders", (r) => r.abort());
  await context.setOffline(false);
  await page.reload();
  await expect(pill).toContainText("1 waiting", { timeout: 15_000 });

  // 5. Reconnect: the sale reaches the server, exactly once.
  await page.unroute("**/api/pos/sync/orders");
  await expect(pill).not.toContainText("waiting", { timeout: 30_000 });
  for (const ref of [online, offline]) {
    const found = await (await request.get(`/api/pos/sales?q=${encodeURIComponent(ref)}`)).json();
    const rows = (Array.isArray(found) ? found : found.items ?? []) as { receipt_no?: string; offline_ref?: string }[];
    expect(rows.filter((s) => s.receipt_no === ref || s.offline_ref === ref)).toHaveLength(1);
  }

  // 6. Return an item from the online sale.
  await page.goto("/pos/returns");
  await page.getByLabel("Receipt number").fill(online);
  await page.getByRole("button", { name: "Find sale" }).click();
  await page.getByLabel(`Return quantity for ${first.name}`).filter({ visible: true }).fill("1");
  await page.getByRole("button", { name: /^Refund Rs/ }).click();
  await expect(page.getByText(/^Refunded /)).toBeVisible();

  // 7. Close with a Z-report (a manager's PIN if the count is off by more than allowed).
  await page.goto("/pos/drawer");
  await expect(page.getByText(/is open$/)).toBeVisible({ timeout: 15_000 });
  for (const field of await page.getByLabel(/counted \(PKR\)$/).all()) await field.fill("0");
  await page.getByRole("button", { name: "Close & print Z-report" }).click();
  const prompt = page.getByRole("dialog", { name: "Manager approval" });
  const z = page.getByRole("dialog", { name: "Z-report" });
  await expect(prompt.or(z)).toBeVisible();
  if (await prompt.isVisible()) {
    await prompt.getByLabel("Their PIN").fill("246813");
    await prompt.getByRole("button", { name: "Approve" }).click();
  }
  await expect(z).toBeVisible();
  await expect(z).toContainText("Net sales");
  await z.getByRole("button", { name: "Done" }).click();

  // 8. Run payroll and download a payslip.
  await page.goto("/hrms/payroll");
  const run = page.getByRole("region", { name: /^Payroll run/ });
  await expect(run).toBeVisible({ timeout: 15_000 });
  const start = run.getByRole("button", { name: "Run payroll" });
  if (await start.isVisible()) await start.click();
  await expect(run.getByText(/^(ready to review|approved|paid|locked)$/)).toBeVisible({ timeout: 60_000 });
  await run.getByText(/^Payslips \(\d+\)$/).click();
  const pdf = run.getByRole("link", { name: /^Payslip PDF for / }).first();
  const res = await page.request.get((await pdf.getAttribute("href"))!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  const approve = run.getByRole("button", { name: "Approve" });
  if (await approve.isVisible()) {
    await approve.click();
    await expect(run.getByText("approved", { exact: true })).toBeVisible();
  }
});
