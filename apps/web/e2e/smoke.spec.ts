import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { API, products } from "./helpers";

// The CI smoke path (2F): a real sign-in through the login form, then a sale
// at the till that the API confirms. Its own throwaway tenant with a known
// password, and a fresh browser context, so it proves login works rather than
// reusing the suite's stored session.
test.use({ storageState: { cookies: [], origins: [] } });

test("sign in, ring up a sale, get a receipt", async ({ page, playwright, browserName }) => {
  test.slow(browserName === "webkit");
  const email = `smoke-${Date.now()}-${randomBytes(3).toString("hex")}@example.com`;
  const password = `${randomBytes(12).toString("base64url")}Aa1!`;

  const api = await playwright.request.newContext();
  const signup = await api.post(`${API}/auth/signup`, {
    data: { company_name: "Smoke Traders", industry_type: "retail", name: "Smoke Owner", email, password,
            sections: ["pos"], sample_data: true },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const [first] = await products(api);
  expect(first, "sample data should seed products").toBeTruthy();

  try {
    // An app route without a session goes to the login page first (middleware.ts).
    await page.goto("/pos");
    // Generous waits: under a parallel run a dev server compiles each route on first hit.
    await expect(page).toHaveURL(/\/login\?next=%2Fpos$/, { timeout: 20_000 });
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/pos$/, { timeout: 20_000 }); // ?next= brought us back

    await page.getByRole("button", { name: new RegExp(first.name) }).first().click();
    await expect(page.getByRole("heading", { name: "Cart (1)" })).toBeVisible();
    const sale = page.waitForResponse((r) => r.url().endsWith("/pos/sales") && r.request().method() === "POST");
    await page.getByRole("button", { name: /^Charge/ }).first().click();
    expect((await sale).status()).toBe(201);
    await expect(page.getByRole("dialog")).toBeVisible(); // the receipt
    await expect(page.getByRole("dialog")).toContainText(first.name);

    const summary = await (await api.get(`${API}/pos/summary`)).json();
    expect(summary.sales_today_count).toBe(1);
  } finally {
    await api.dispose();
  }
});
