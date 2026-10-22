import { expect, test, type APIRequestContext } from "@playwright/test";
import { API, ready } from "./helpers";

type Stage = { id: string; name: string; is_won: boolean };
type Pipeline = { id: string; is_default: boolean; stages: Stage[] };

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A lead of our own, so these tests never disturb the sample data others read. */
async function freshLead(request: APIRequestContext, extra: Record<string, unknown> = {}) {
  const pipelines: Pipeline[] = await (await request.get(`${API}/crm/pipelines`)).json();
  const pipeline = pipelines.find((p) => p.is_default) ?? pipelines[0];
  const res = await request.post(`${API}/crm/leads`, {
    data: { name: `V2 Lead ${uid()}`, source: "manual", value_minor: 1_000_000, force: true, pipeline_id: pipeline.id, ...extra },
  });
  expect(res.ok()).toBeTruthy();
  return { lead: await res.json(), pipeline };
}

test.describe("lost is a status", () => {
  test("a lead is marked lost with a reason, leaves the board, and is restored", async ({ page, request }) => {
    const { lead } = await freshLead(request);
    await page.goto("/crm");
    await page.getByRole("main").getByRole("button", { name: `Open ${lead.name}` }).click();
    const drawer = page.getByRole("dialog", { name: lead.name });
    await drawer.getByRole("button", { name: "Lost", exact: true }).click();

    const dialog = page.getByRole("dialog", { name: `Mark ${lead.name} as lost` });
    await dialog.getByLabel("Reason").selectOption({ label: "Price too high" });
    await dialog.getByLabel("Note").fill("Found it cheaper in Saddar");
    await dialog.getByRole("button", { name: "Mark lost" }).click();
    await expect(dialog).toBeHidden();
    await expect(drawer.getByText(/^Price too high ·/)).toBeVisible();   // the status bar
    await expect(drawer.locator('[data-kind="lost"]')).toContainText("Found it cheaper in Saddar");
    await page.keyboard.press("Escape");

    await expect(page.getByRole("main").getByRole("button", { name: `Open ${lead.name}` })).toHaveCount(0);
    await page.getByLabel("Show").selectOption("lost");
    await page.getByRole("button", { name: `Restore ${lead.name}` }).filter({ visible: true }).click();
    await expect(page.getByText("Restored")).toBeVisible();
    await page.getByLabel("Show").selectOption("active");
    await expect(page.getByRole("main").getByRole("button", { name: `Open ${lead.name}` })).toBeVisible();
  });

  test("the Won button closes the deal into the won column", async ({ page, request }) => {
    const { lead, pipeline } = await freshLead(request);
    const won = pipeline.stages.find((s) => s.is_won)!;
    await page.goto("/crm");
    await page.getByRole("main").getByRole("button", { name: `Open ${lead.name}` }).click();
    const drawer = page.getByRole("dialog", { name: lead.name });
    await drawer.getByRole("button", { name: "Won", exact: true }).click();
    await expect(drawer.getByText("Won", { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: won.name }).getByRole("button", { name: `Open ${lead.name}` })).toBeVisible();
  });
});

test.describe("activities and My day", () => {
  test("an activity scheduled from the drawer shows in My day and the badge, and Done clears it", async ({ page, request }) => {
    const { lead } = await freshLead(request);
    const summary = `Call ${uid()}`;
    await page.goto("/crm");
    await page.getByRole("main").getByRole("button", { name: `Open ${lead.name}` }).click();
    const drawer = page.getByRole("dialog", { name: lead.name });
    await drawer.getByLabel("What to do").fill(summary);
    await drawer.getByRole("button", { name: "Schedule" }).click();
    await expect(drawer.getByText(summary)).toBeVisible();
    await page.keyboard.press("Escape");
    // The card carries the activity dot.
    await expect(page.getByRole("main").getByRole("button", { name: `Open ${lead.name}` })).toContainText("Activity due today");

    await page.goto("/my-day");
    await ready(page);
    await expect(page.getByTestId("my-day-badge").first()).toBeVisible();
    const today = page.getByRole("region", { name: /today/i });
    await expect(today.getByText(summary)).toBeVisible();
    await today.getByRole("button", { name: `Done: ${summary}` }).click();
    await expect(page.getByText(summary)).toHaveCount(0);
  });

  test("a note added in the drawer lands on the timeline", async ({ page, request }) => {
    const { lead } = await freshLead(request);
    await page.goto("/crm");
    await page.getByRole("main").getByRole("button", { name: `Open ${lead.name}` }).click();
    const drawer = page.getByRole("dialog", { name: lead.name });
    await drawer.getByLabel("Add a note").fill("Wants delivery after Eid");
    await drawer.getByRole("button", { name: "Add note" }).click();
    await expect(drawer.locator('[data-kind="note"]').first()).toContainText("Wants delivery after Eid");
    await expect(drawer.locator('[data-kind="system"]')).toContainText("Created");
  });
});

test.describe("board headers and reports", () => {
  test("each open column shows its weighted value", async ({ page, request }) => {
    const { pipeline } = await freshLead(request);
    await page.goto("/crm");
    const first = page.getByRole("region", { name: pipeline.stages[0].name });
    await expect(first.getByTitle("Value × probability")).toContainText("weighted");
  });

  test("the reports page shows the funnel, lost reasons and sources with CSV downloads", async ({ page }) => {
    await page.goto("/crm/reports");
    await ready(page);
    for (const title of ["Funnel", "Lost reasons", "Sources"]) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
    const link = page.getByRole("link", { name: /download csv \(funnel\)/i });
    await expect(link).toHaveAttribute("href", /\/crm\/reports\/funnel\?.*format=csv/);
    const res = await page.request.get(await link.getAttribute("href") as string);
    expect(res.headers()["content-type"]).toContain("text/csv");
  });
});

test.describe("automations", () => {
  test("a rule can plan an activity for the owner when a lead is won", async ({ page, request }) => {
    const name = `Collect ${uid()}`;
    await page.goto("/automations");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("When…").selectOption("lead.won");
    await page.getByLabel("Then…").selectOption("activity");
    await page.getByRole("combobox", { name: "Activity", exact: true }).selectOption("Collect payment");
    await page.getByLabel("Due in (days)").fill("2");
    await page.getByLabel("Activity summary").fill("Collect from {name}");
    await page.getByRole("button", { name: "Create automation" }).click();
    await expect(page.getByText("plans an activity").first()).toBeVisible();

    try {
      const { lead } = await freshLead(request);
      expect((await request.post(`${API}/crm/leads/${lead.id}/won`)).ok()).toBeTruthy();
      const acts = await (await request.get(`${API}/activities?entity_id=${lead.id}`)).json();
      expect(acts.map((a: { summary: string }) => a.summary)).toContain(`Collect from ${lead.name}`);
    } finally {
      const rules = await (await request.get(`${API}/workflows`)).json();
      const rule = rules.find((r: { name: string }) => r.name === name);
      if (rule) await request.delete(`${API}/workflows/${rule.id}`);
    }
  });
});

test.describe("CRM settings", () => {
  test("an admin adds a stage and deletes it again", async ({ page }) => {
    const name = `Visit ${uid()}`;
    await page.goto("/crm/settings");
    await ready(page);
    await page.getByLabel("New stage").fill(name);
    await page.getByRole("button", { name: "Add stage" }).click();
    await expect(page.getByRole("button", { name: `Delete ${name}` })).toBeVisible();
    await page.getByRole("button", { name: `Delete ${name}` }).click();
    const dialog = page.getByRole("dialog", { name: `Delete ${name}?` });
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("button", { name: `Delete ${name}` })).toHaveCount(0);
  });
});

test.describe("lead tags", () => {
  test("a tag added in the drawer shows on the card and filters the board", async ({ page, request }) => {
    const tagName = `Tag ${uid()}`;
    const tag = await (await request.post(`${API}/tags`, { data: { name: tagName } })).json();
    const { lead } = await freshLead(request);
    const { lead: other } = await freshLead(request);
    await page.goto("/crm");
    const main = page.getByRole("main");
    await main.getByRole("button", { name: `Open ${lead.name}` }).click();
    const drawer = page.getByRole("dialog", { name: lead.name });
    await drawer.getByLabel("Add tag").selectOption({ label: tagName });
    await expect(drawer.getByRole("button", { name: `Remove tag ${tagName}` })).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(main.getByRole("button", { name: `Open ${lead.name}` })).toContainText(tagName);
    await page.getByLabel("Tag", { exact: true }).selectOption(tag.id);
    await expect(main.getByRole("button", { name: `Open ${lead.name}` })).toBeVisible();
    await expect(main.getByRole("button", { name: `Open ${other.name}` })).toHaveCount(0);
  });
});
