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
    test.slow();   // two browser sessions (rep and customer)
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
    await forms.getByLabel("Marketing tick (leave empty to not ask)").fill("Send me offers by email");
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
    await vp.getByRole("checkbox", { name: "Send me offers by email" }).check();
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
    expect(lead.consent_at).toBeTruthy();
    expect(lead.consent_text).toBe("Send me offers by email");
  });
});

test.describe("targets and forecast", () => {
  test("a manager sets this month's company target and sees progress; the forecast lists an open deal", async ({ page, request }) => {
    const close = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
    const name = `Forecast ${uid()}`;
    const res = await request.post(`${API}/crm/leads`, {
      data: { name, value_minor: 300_000_00, force: true, expected_close_date: close },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto("/crm/reports");
    const targets = page.getByRole("heading", { name: "Targets" }).locator("../..");
    await targets.getByLabel("Measure").selectOption("collected");
    await targets.getByLabel("Target (PKR)").fill("1000000");
    await targets.getByRole("button", { name: "Set target" }).click();
    await expect(page.getByText("Target saved")).toBeVisible();
    await expect(targets.getByText(/Whole company · Collected/)).toBeVisible();
    await expect(targets.getByText(/of Rs\s?10,00,000|of PKR\s?1,000,000|1,000,000/)).toBeVisible();

    const forecast = page.getByRole("heading", { name: "Forecast" }).locator("..");
    await forecast.getByRole("row").nth(1).getByRole("button").click();   // this month's deals
    await expect(forecast.getByText(name)).toBeVisible();
  });
});

test.describe("campaigns", () => {
  test("a contact who agreed gets the campaign; the send says who was left out", async ({ page, request }) => {
    const id = uid();
    const tag = await (await request.post(`${API}/tags`, { data: { name: `Eid ${id}` } })).json();
    const yes = await (await request.post(`${API}/contacts`, {
      data: { name: `Sara ${id}`, email: `sara.${id}@example.com`, force: true, tag_ids: [tag.id] } })).json();
    await request.post(`${API}/contacts`, {
      data: { name: `Omar ${id}`, email: `omar.${id}@example.com`, force: true, tag_ids: [tag.id] } });

    // Consent is recorded on the contact's page.
    await page.goto(`/contacts/${yes.id}`);
    await page.getByRole("tab", { name: "Details" }).click();
    await page.getByLabel("Email marketing").selectOption("opted_in");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    await page.goto("/crm/campaigns");
    const lists = page.getByRole("heading", { name: "Saved lists" }).locator("..");
    await lists.getByLabel("List name").fill(`Eid list ${id}`);
    await lists.getByLabel("With tag").selectOption({ label: `Eid ${id}` });
    await lists.getByRole("button", { name: "Save list" }).click();
    await expect(page.getByText("List saved")).toBeVisible();

    const tpls = page.getByRole("heading", { name: "Email templates" }).locator("..");
    await tpls.getByLabel("Template name").fill(`Eid offer ${id}`);
    await tpls.getByLabel("Subject").fill("Eid Mubarak, {{first_name}}!");
    await tpls.getByLabel("Message").fill("Dear {{first_name|Customer}}, 20% off this week.");
    await tpls.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByText("Template saved")).toBeVisible();

    const camps = page.getByRole("heading", { name: "Campaigns" }).locator("..");
    await camps.getByLabel("Campaign name").fill(`Eid ${id}`);
    await camps.getByLabel("Send to").selectOption({ label: `Eid list ${id}` });
    await camps.getByLabel("Message").selectOption({ label: `Eid offer ${id}` });
    await camps.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Campaign saved as a draft")).toBeVisible();

    await camps.getByRole("listitem").filter({ hasText: `Eid ${id}` }).getByRole("button", { name: "Send" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("to 1 person");
    await expect(dialog).toContainText("1 haven't agreed to marketing");
    await dialog.getByRole("button", { name: "Send now" }).click();
    await expect(camps.getByRole("listitem").filter({ hasText: `Eid ${id}` })).toContainText("1 sent, 1 left out");
  });
});

test.describe("custom fields", () => {
  test("an admin adds a lead field, a rep fills it in, and the lead shows it", async ({ page, request }) => {
    const label = `Plot size ${uid()}`;
    await page.goto("/crm/settings");
    const card = page.getByRole("heading", { name: "Custom fields" }).locator("../..");
    await card.getByLabel("Field name").fill(label);
    await card.getByLabel("Kind").selectOption("number");
    await card.getByRole("button", { name: "Add field" }).click();
    await expect(page.getByText("Field added")).toBeVisible();
    await expect(card.getByRole("button", { name: `Retire ${label}` })).toBeVisible();

    const lead = await freshLead(request);
    await page.goto("/crm");
    await page.getByRole("main").getByRole("button", { name: `Open ${lead.name}` }).click();
    const drawer = page.getByRole("dialog", { name: lead.name });
    await drawer.getByRole("button", { name: "Edit details" }).click();
    await drawer.getByLabel(label).fill("12");
    await drawer.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Changes saved")).toBeVisible();
    await expect(drawer.getByText(label, { exact: true }).locator("..")).toContainText("12");
  });
});

test.describe("quote email and PDF", () => {
  test("a rep emails an open quote and both sides can get its PDF", async ({ page, request, browser }) => {
    test.slow();   // two browser sessions (rep and customer)
    const lead = await freshLead(request);
    await request.put(`${API}/crm/leads/${lead.id}/lines`, {
      data: { lines: [{ description: "Inverter 5 kW", qty: 1, unit_price_minor: 300_000_00 }] },
    });
    const quote = await (await request.post(`${API}/crm/leads/${lead.id}/quotes`, { data: {} })).json();

    await page.goto("/crm");
    await page.getByRole("main").getByRole("button", { name: `Open ${lead.name}` }).click();
    const quotes = page.getByRole("dialog", { name: lead.name }).getByRole("region", { name: "Quotes" });
    await expect(quotes.getByRole("link", { name: `PDF of quote ${quote.number}` })).toHaveAttribute("href", /\/pdf$/);
    await quotes.getByRole("button", { name: "Email" }).click();
    await quotes.getByLabel(/Send to/).fill(`buyer.${uid()}@example.com`);
    await quotes.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText(/Quote on its way to buyer\./)).toBeVisible();
    await expect(quotes.getByText(/^Last emailed/)).toBeVisible();

    const customer = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const cp = await customer.newPage();
    await cp.goto(quote.link);
    const pdf = cp.getByRole("link", { name: "Download PDF" });
    await expect(pdf).toBeVisible();
    const res = await cp.request.get(new URL(await pdf.getAttribute("href") ?? "", cp.url()).toString());
    expect(res.headers()["content-type"]).toBe("application/pdf");
    await customer.close();
  });
});

test.describe("assignment rules and marketing confirmation", () => {
  test("an admin adds a rule that sends a source's leads to chosen pool members", async ({ page, request }) => {
    const roles = await (await request.get(`${API}/team/roles`)).json();
    const role = roles.find((r: { name: string }) => r.name !== "Owner") ?? roles[0];
    const name = `Rep ${uid()}`;
    const user = await (await request.post(`${API}/team/users`, { data: {
      name, email: `rep.${uid()}@example.com`, password: "Sup3rSecret!23", role_id: role.id } })).json();
    const pool = await (await request.get(`${API}/crm/assignment/pool`)).json();
    await request.put(`${API}/crm/assignment/pool`, { data: { members: [
      ...pool.map((m: { user_id: string; active: boolean; daily_cap: number | null }) =>
        ({ user_id: m.user_id, active: m.active, daily_cap: m.daily_cap })),
      { user_id: user.id }] } });

    await page.goto("/crm/settings");
    const rules = page.getByRole("heading", { name: "Assignment rules" }).locator("..");
    const ruleName = `Facebook ${uid()}`;
    await rules.getByLabel("Rule name").fill(ruleName);
    await rules.getByLabel("When the source is").fill("facebook page");
    await rules.getByLabel(name).check();
    await rules.getByRole("button", { name: "Add rule" }).click();
    await expect(rules.getByRole("button", { name: `Remove rule ${ruleName}` })).toBeVisible();
    await expect(rules.getByText(new RegExp(`source “facebook page” → .*${name}`))).toBeVisible();
  });

  test("a form tick becomes an opt-in only when the inbox owner confirms", async ({ request, browser }) => {
    test.slow();   // two browser sessions (rep and customer)
    const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
    test.skip(!(await request.get(`${MAILPIT}/api/v1/messages`).catch(() => null))?.ok(), "needs Mailpit");
    const form = await (await request.post(`${API}/crm/web-forms`, { data: {
      name: `Offers ${uid()}`, fields: ["email"], consent_label: "Send me offers" } })).json();
    const address = `fan.${uid()}@example.com`;
    const visitor = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).request;
    const ticket = (await (await visitor.get(`${API}/public/forms/${form.public_id}`)).json()).ticket;
    await new Promise((r) => setTimeout(r, 3_500));            // the server drops forms filled in under 3 s
    const sent = await visitor.post(`${API}/public/forms/${form.public_id}`, {
      data: { ticket, values: { name: `Fan ${uid()}`, email: address, consent: true } } });
    expect(sent.ok()).toBeTruthy();

    const leads = await (await request.get(`${API}/crm/leads`)).json();
    const lead = leads.find((l: { email: string }) => l.email === address);
    const qualified = await (await request.post(`${API}/crm/leads/${lead.id}/qualify`, { data: { mode: "create" } })).json();
    const contactId = qualified.contact.id;
    expect(await (await request.get(`${API}/contacts/${contactId}/consents`)).json()).toEqual([]);

    let link = "";
    for (let i = 0; i < 20 && !link; i++) {
      const found = await (await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`)).json();
      if (found.messages?.length) {
        const msg = await (await request.get(`${MAILPIT}/api/v1/message/${found.messages[0].ID}`)).json();
        link = /\/c\/[\w.-]+/.exec(msg.Text)?.[0] ?? "";
      }
      if (!link) await new Promise((r) => setTimeout(r, 500));
    }
    expect(link).toMatch(/^\/c\//);

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const cp = await ctx.newPage();
    await cp.goto(link);
    await cp.getByRole("button", { name: "Yes, send me offers" }).click();
    await expect(cp.getByText(/Thank you/)).toBeVisible();
    await ctx.close();
    const after = await (await request.get(`${API}/contacts/${contactId}/consents`)).json();
    expect(after).toEqual([expect.objectContaining({ channel: "email", status: "opted_in" })]);
  });
});

test.describe("custom field filters", () => {
  test("the board filters on a lead's choice field", async ({ page, request }) => {
    const label = `Area ${uid()}`;
    const field = await (await request.post(`${API}/custom-fields`, {
      data: { entity: "lead", label, kind: "select", options: ["DHA", "Bahria"] } })).json();
    const dha = await (await request.post(`${API}/crm/leads`, {
      data: { name: `DHA lead ${uid()}`, force: true, custom: { [field.key]: "DHA" } } })).json();
    const bahria = await (await request.post(`${API}/crm/leads`, {
      data: { name: `Bahria lead ${uid()}`, force: true, custom: { [field.key]: "Bahria" } } })).json();

    await page.goto("/crm");
    const main = page.getByRole("main");
    await expect(main.getByRole("button", { name: `Open ${bahria.name}` })).toBeVisible();
    await page.getByLabel("Custom field").selectOption({ label: `${label}: DHA` });
    await expect(main.getByRole("button", { name: `Open ${dha.name}` })).toBeVisible();
    await expect(main.getByRole("button", { name: `Open ${bahria.name}` })).toHaveCount(0);
  });
});

test.describe("forecast", () => {
  test("a deal is moved to next month from the forecast", async ({ page, request }) => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
    const name = `Mover ${uid()}`;
    const lead = await (await request.post(`${API}/crm/leads`, {
      data: { name, value_minor: 100_000_00, force: true, expected_close_date: today } })).json();
    await page.goto("/crm/reports");
    const forecast = page.getByRole("heading", { name: "Forecast" }).locator("..");
    await forecast.getByRole("row").nth(1).getByRole("button").click();       // this month's deals
    const move = forecast.getByLabel(`Move ${name} to month`);
    const next = await move.locator("option").nth(2).getAttribute("value");   // [date, this month, next month, …]
    await move.selectOption(next!);
    await expect(page.getByText("Close date moved")).toBeVisible();
    const after = await (await request.get(`${API}/crm/leads/${lead.id}`)).json();
    expect(after.lead.expected_close_date.slice(0, 7)).toBe(next);
  });
});

test.describe("quote signature", () => {
  test("the customer signs in the box and the quote records it", async ({ request, browser }) => {
    test.slow();   // two browser sessions (rep and customer)
    const lead = await freshLead(request);
    await request.put(`${API}/crm/leads/${lead.id}/lines`, {
      data: { lines: [{ description: "Battery bank", qty: 1, unit_price_minor: 200_000_00 }] } });
    const quote = await (await request.post(`${API}/crm/leads/${lead.id}/quotes`, { data: {} })).json();

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const cp = await ctx.newPage();
    await cp.goto(quote.link);
    await cp.getByLabel("Your full name").fill("Sana Iqbal");
    await cp.getByRole("checkbox").check();
    const box = await cp.getByRole("img", { name: "Signature box" }).boundingBox();
    await cp.mouse.move(box!.x + 20, box!.y + 60);
    await cp.mouse.down();
    await cp.mouse.move(box!.x + 120, box!.y + 30, { steps: 8 });
    await cp.mouse.move(box!.x + 220, box!.y + 80, { steps: 8 });
    await cp.mouse.up();
    await expect(cp.getByText("Signed", { exact: true })).toBeVisible();
    await cp.getByRole("button", { name: "Accept quote" }).click();
    await expect(cp.getByText(/by Sana Iqbal/)).toBeVisible();
    await ctx.close();

    const after = await (await request.get(`${API}/crm/quotes/${quote.id}`)).json();
    expect(after.status).toBe("accepted");
    expect(after.signed).toBe(true);
  });
});
