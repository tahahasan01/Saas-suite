import { expect, test } from "@playwright/test";

/* Joining and leaving (wave C, H23/H24): record a leaver from their profile,
 * see the exit date, tick the checklist, save the exit interview and
 * complete it; then the joining checklist from a template. */
test("a leaver's checklist is ticked, interviewed and completed", async ({ page, request }) => {
  const r = await request.post("/api/hrms/employees", { data: { name: `Leaver ${Date.now().toString(36)}`, join_date: "2025-01-06" } });
  test.skip(!r.ok(), "needs Staff turned on");
  const person = (await r.json()) as { id: string; name: string };

  await page.goto(`/hrms/employees/${person.id}`);
  await page.getByRole("button", { name: "Record leaving" }).click({ timeout: 15_000 });
  const start = page.getByRole("dialog", { name: "Record leaving" });
  await start.getByLabel("Notice given on").fill("2026-12-01");
  await start.getByLabel("Last working day").fill("2026-12-31");
  await start.getByRole("button", { name: "Start" }).click();

  const sheet = page.getByRole("dialog", { name: `Leaving: ${person.name}` });
  await expect(sheet).toContainText("last day 31 Dec 2026");
  await expect(sheet.getByRole("list", { name: "Tasks" })).toContainText("Return company assets");
  await expect(sheet).toContainText("All returned.");
  const complete = sheet.getByRole("button", { name: "Mark complete" });
  await expect(complete).toBeDisabled();

  await sheet.getByRole("button", { name: "Skip Experience letter" }).click();
  const skip = page.getByRole("dialog", { name: "Skip Experience letter" });
  await skip.getByLabel("Why").fill("Asked not to have one");
  await skip.getByRole("button", { name: "Skip task" }).click();
  await expect(sheet).toContainText("skipped: Asked not to have one");

  const interview = sheet.getByRole("form", { name: "Exit interview" });
  await interview.getByLabel("Main reason").selectOption("pay");
  await interview.getByLabel("Outcome").selectOption("leaving");
  await interview.getByRole("button", { name: "Save interview" }).click();
  await expect(page.getByText("Exit interview saved")).toBeVisible();

  const boxes = sheet.getByRole("list", { name: "Tasks" }).getByRole("checkbox");
  for (let i = 0; i < (await boxes.count()); i++) {
    const box = boxes.nth(i);
    if (!(await box.isChecked())) {
      await box.check();
      await expect(box).toBeChecked();
    }
  }
  await complete.click();
  await expect(sheet.getByRole("button", { name: "Mark complete" })).toHaveCount(0);
  await sheet.getByRole("button", { name: /close/i }).first().click();
  await expect(page.getByText("Leaving on")).toContainText("31 Dec 2026");
});

test("a joining checklist comes from a template", async ({ page, request }) => {
  const r = await request.post("/api/hrms/employees", { data: { name: `Joiner ${Date.now().toString(36)}`, join_date: "2026-11-02" } });
  test.skip(!r.ok(), "needs Staff turned on");
  const person = (await r.json()) as { id: string; name: string };
  const name = `Shop staff ${Date.now().toString(36)}`;

  await page.goto("/hrms/boarding");
  await page.getByRole("tab", { name: "Templates" }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: "New template" }).click();
  const t = page.getByRole("dialog", { name: "New template" });
  await t.getByLabel("Name").fill(name);
  await t.getByLabel("Task 1", { exact: true }).fill("Uniform and name badge");
  await t.getByLabel("Day").fill("-1");
  await t.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("list", { name: "Templates" })).toContainText(name);

  await page.goto(`/hrms/employees/${person.id}`);
  await page.getByRole("button", { name: "Start joining checklist" }).click({ timeout: 15_000 });
  const start = page.getByRole("dialog", { name: "Start joining checklist" });
  await start.getByLabel("Checklist").selectOption({ label: name });
  await start.getByRole("button", { name: "Start" }).click();
  const sheet = page.getByRole("dialog", { name: `Joining: ${person.name}` });
  await expect(sheet.getByRole("list", { name: "Tasks" })).toContainText("Uniform and name badge");
  await expect(sheet).toContainText("due 1 Nov 2026");
});
