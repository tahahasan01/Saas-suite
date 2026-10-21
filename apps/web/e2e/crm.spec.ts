import { expect, test, type APIRequestContext } from "@playwright/test";
import { API } from "./helpers";

type Stage = { id: string; name: string; kind: string };
type Pipeline = { id: string; stages: Stage[] };

/** A lead of our own, so moving it never disturbs the sample data other tests read. */
async function freshLead(request: APIRequestContext) {
  const pipelines: Pipeline[] = await (await request.get(`${API}/crm/pipelines`)).json();
  const name = `Move Test ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const res = await request.post(`${API}/crm/leads`, { data: { name, source: "manual", value_minor: 0, force: true } });
  expect(res.ok()).toBeTruthy();
  const lead = await res.json();
  return { lead, stages: pipelines[0].stages };
}

async function stageOf(request: APIRequestContext, id: string) {
  const res = await request.get(`${API}/crm/leads/${id}`);
  return (await res.json()).lead.stage_id as string;
}

test.describe("CRM without dragging", () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test("a lead can be moved to another stage from its drawer", async ({ page, request }) => {
    const { lead, stages } = await freshLead(request);
    const target = stages.find((s) => s.id !== lead.stage_id)!;

    await page.goto("/crm");
    await page.getByRole("button", { name: `Open ${lead.name}` }).click();
    const drawer = page.getByRole("dialog", { name: lead.name });
    await expect(drawer).toBeVisible();

    await drawer.getByLabel(/move to stage/i).selectOption(target.id);
    await expect.poll(() => stageOf(request, lead.id)).toBe(target.id);

    await page.keyboard.press("Escape");
    // The card now sits in the target column.
    await expect(page.getByRole("region", { name: target.name }).getByRole("button", { name: `Open ${lead.name}` })).toBeVisible();
  });

  test("a lead card opens with the keyboard", async ({ page, request }) => {
    const { lead } = await freshLead(request);
    await page.goto("/crm");
    await page.getByRole("button", { name: `Open ${lead.name}` }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: lead.name })).toBeVisible();
  });
});

test.describe("CRM list view on a phone", () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test("rows are cards that open the lead, and the stage can be changed in place", async ({ page, request }) => {
    const { lead, stages } = await freshLead(request);
    const target = stages.find((s) => s.id !== lead.stage_id)!;
    await page.goto("/crm");
    await page.getByRole("tab", { name: "list" }).click();
    await page.getByLabel(`Stage for ${lead.name}`).filter({ visible: true }).selectOption(target.id);
    await expect.poll(() => stageOf(request, lead.id)).toBe(target.id);
    await page.getByRole("button", { name: `Open ${lead.name}` }).click();
    await expect(page.getByRole("dialog", { name: lead.name })).toBeVisible();
  });
});

test.describe("invoices and automations", () => {
  test("an invoice requested from a lead is approved only after confirming", async ({ page, request }) => {
    const { lead } = await freshLead(request);
    // Invoices bill a contact (0061): qualify the lead first.
    expect((await request.post(`${API}/crm/leads/${lead.id}/qualify`, { data: { mode: "create", force: true } })).ok()).toBeTruthy();
    await page.goto("/crm");
    await page.getByRole("main").getByRole("button", { name: `Open ${lead.name}` }).click();
    const drawer = page.getByRole("dialog", { name: lead.name });
    await drawer.getByLabel("Amount (PKR)").fill("1234");
    const requestBtn = drawer.getByRole("button", { name: "Request" });
    // A double tap must post once.
    const posts: string[] = [];
    page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/crm/invoices")) posts.push(r.url()); });
    await requestBtn.dblclick();
    await expect(page.getByText(/invoice requested/i)).toBeVisible();
    expect(posts).toHaveLength(1);
    await page.keyboard.press("Escape");

    await page.goto("/invoices");
    const row = page.getByRole("row").filter({ hasText: lead.name });
    await row.getByRole("button", { name: "Approve" }).click();
    const confirm = page.getByRole("dialog", { name: /approve this invoice/i });
    await expect(confirm).toContainText(lead.name);
    await confirm.getByRole("button", { name: "Approve" }).click();
    await expect(confirm).toBeHidden();
    await expect(row).toContainText("approved");
  });

  test("an automation can be switched off and deleted after naming it", async ({ page }) => {
    const name = `Rule ${Date.now().toString(36)}`;
    await page.goto("/automations");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Notify with message").fill("Hello {name}");
    await page.getByRole("button", { name: "Create automation" }).click();

    const sw = page.getByRole("switch", { name: `Enable ${name}` });
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");

    await page.getByRole("button", { name: `Delete ${name}` }).click();
    const confirm = page.getByRole("dialog", { name: new RegExp(name) });
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(sw).toHaveCount(0);
  });
});
