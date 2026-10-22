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

test.describe("quotes the customer accepts online", () => {
  test("a rep sends a quote, the customer accepts it from the link, and the deal is won", async ({ page, request, browser }) => {
    const lead = await freshLead(request);
    const lines = await request.put(`${API}/crm/leads/${lead.id}/lines`, {
      data: { lines: [{ description: "Rooftop solar, 5 kW", qty: 1, unit_price_minor: 850_000_00 }] },
    });
    expect(lines.ok()).toBeTruthy();

    await page.goto("/crm");
    await page.getByRole("main").getByRole("button", { name: `Open ${lead.name}` }).click();
    const drawer = page.getByRole("dialog", { name: lead.name });
    const quotes = drawer.getByRole("region", { name: "Quotes" });
    await quotes.getByRole("button", { name: "Send a quote" }).click();
    await quotes.getByLabel("Terms").fill("50% advance, rest on installation");
    await quotes.getByRole("button", { name: "Make quote" }).click();
    await expect(quotes.getByText(/^QT-/)).toBeVisible();
    await expect(quotes.getByRole("link", { name: "Share on WhatsApp" })).toHaveAttribute("href", /wa\.me/);

    const [quote] = await (await request.get(`${API}/crm/leads/${lead.id}/quotes`)).json();

    // The customer: no session at all.
    const customer = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const cp = await customer.newPage();
    const res = await cp.goto(quote.link);
    expect(res?.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(cp.getByRole("heading", { name: `Quote ${quote.number}` })).toBeVisible();
    await expect(cp.getByText("Rooftop solar, 5 kW")).toBeVisible();
    await expect(cp.getByText("50% advance, rest on installation")).toBeVisible();
    await cp.getByLabel("Your full name").fill("Bilal Ahmed");
    await cp.getByRole("checkbox").check();
    await cp.getByRole("button", { name: "Accept quote" }).click();
    await expect(cp.getByText(/by Bilal Ahmed/)).toBeVisible();
    await customer.close();

    // Back with the rep: the deal is won and the quote shows who accepted it.
    await page.reload();
    await page.getByRole("main").getByRole("button", { name: `Open ${lead.name}` }).click();
    const again = page.getByRole("dialog", { name: lead.name });
    await expect(again.getByText("Won", { exact: true }).first()).toBeVisible();
    const quotesNow = again.getByRole("region", { name: "Quotes" });
    await expect(quotesNow.getByText("Accepted", { exact: true })).toBeVisible();
    await expect(quotesNow.getByText(/Accepted by Bilal Ahmed/)).toBeVisible();
    const after = await (await request.get(`${API}/crm/quotes/${quote.id}`)).json();
    expect(after.view_count).toBeGreaterThan(0);   // the page's beacon, not the preview GET
  });
});

test.describe("web forms", () => {
  test("an admin makes a form, a visitor fills it in signed out, and it becomes a lead", async ({ page, request, browser }) => {
    const formName = `Website ${uid()}`;
    const visitor = `Ayesha ${uid()}`;
    // A new number each run: a repeat enquiry from an open lead's phone is merged into that lead.
    const phone = `0300${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    await page.goto("/crm/settings");
    const forms = page.getByRole("heading", { name: "Web forms" }).locator("..").locator("..");
    await forms.getByRole("button", { name: "New form" }).click();
    await forms.getByLabel("Form name (for you)").fill(formName);
    await forms.getByLabel("Heading customers see").fill("Get a free survey");
    await forms.getByLabel("Source on the lead").fill("website");
    await forms.getByRole("button", { name: "Save form" }).click();
    await expect(page.getByText("Form saved")).toBeVisible();
    await expect(forms.getByText(formName)).toBeVisible();

    const list = await (await request.get(`${API}/crm/web-forms`)).json();
    const form = list.find((f: { name: string }) => f.name === formName);

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const vp = await ctx.newPage();
    await vp.goto(`${form.link}?utm_source=facebook&utm_campaign=winter`);
    await expect(vp.getByRole("heading", { name: "Get a free survey" })).toBeVisible();
    await vp.getByLabel("Your name").fill(visitor);
    await vp.getByLabel("Phone").fill(phone);
    await vp.getByLabel("Message").fill("Please call after 5pm");
    // The server drops forms sent faster than a person could fill them (3 s).
    await vp.waitForTimeout(3_500);
    await vp.getByRole("button", { name: "Send" }).click();
    await expect(vp.getByText("Thank you. We'll be in touch soon.")).toBeVisible();
    await ctx.close();

    const leads = await (await request.get(`${API}/crm/leads`)).json();
    const lead = leads.find((l: { name: string }) => l.name === visitor);
    expect(lead).toBeTruthy();
    expect(lead.source).toBe("website");
    expect(lead.phone).toBe(`+92${phone.slice(1)}`);
  });
});
