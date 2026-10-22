import { expect, test } from "@playwright/test";

/* Performance (wave C, H25/H26): confirm a probation that's ending, then
 * run an appraisal cycle from a KRA template and review one person. */
test("probation ending soon is confirmed", async ({ page, request }) => {
  const soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const r = await request.post("/api/hrms/employees", { data: { name: `Trainee ${Date.now().toString(36)}` } });
  test.skip(!r.ok(), "needs Staff turned on");
  const person = (await r.json()) as { id: string; name: string };
  await request.patch(`/api/hrms/employees/${person.id}/job`, { data: { employment_type: "probation", probation_end: soon } });

  await page.goto("/hrms/performance");
  const row = page.getByRole("list", { name: "Probation ending" }).getByRole("listitem").filter({ hasText: person.name });
  await row.getByRole("button", { name: `Decide probation for ${person.name}` }).click({ timeout: 15_000 });
  const d = page.getByRole("dialog", { name: `Probation: ${person.name}` });
  await d.getByLabel("Note").fill("Good first months");
  await d.getByRole("button", { name: "Save decision" }).click();
  await expect(page.getByText("Probation decided")).toBeVisible();
  await expect(row).toHaveCount(0);
});

test("an appraisal cycle is opened and one person reviewed to a weighted score", async ({ page, request }) => {
  const r = await request.post("/api/hrms/employees", { data: { name: `Seller ${Date.now().toString(36)}` } });
  test.skip(!r.ok(), "needs Staff turned on");
  const person = (await r.json()) as { id: string; name: string };
  const tag = Date.now().toString(36);

  await page.goto("/hrms/performance");
  await page.getByRole("tab", { name: "KRA templates" }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: "New KRA template" }).click();
  const t = page.getByRole("dialog", { name: "New KRA template" });
  await t.getByLabel("Name").fill(`Sales ${tag}`);
  await t.getByLabel("KRA 1", { exact: true }).fill("Sales target");
  await t.getByLabel("Weight %").first().fill("60");
  await t.getByRole("button", { name: "Add a KRA" }).click();
  await t.getByLabel("KRA 2", { exact: true }).fill("Customer care");
  await expect(t.getByRole("button", { name: "Save" })).toBeDisabled();       // 60 + 0 isn't 100
  await t.getByLabel("Weight %").nth(1).fill("40");
  await t.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("list", { name: "KRA templates" })).toContainText(`Sales ${tag}`);

  await page.getByRole("tab", { name: "Appraisals" }).click();
  await page.getByRole("button", { name: "New appraisal cycle" }).click();
  const n = page.getByRole("dialog", { name: "New appraisal cycle" });
  await n.getByLabel("Name").fill(`Review ${tag}`);
  await n.getByLabel("KRA template").selectOption({ label: `Sales ${tag}` });
  await n.getByRole("button", { name: "Create" }).click();
  const cycle = page.getByRole("dialog", { name: `Review ${tag}` });
  await cycle.getByRole("button", { name: "Open cycle" }).click();
  await cycle.getByRole("button", { name: `Review ${person.name}` }).click();

  const review = page.getByRole("dialog", { name: `Review ${person.name}` });
  await review.getByLabel("Rating for Sales target").selectOption("5");
  await review.getByLabel("Rating for Customer care").selectOption("3");
  await review.getByRole("button", { name: "Finish review" }).click();
  // 5 × 60% + 3 × 40% = 4.20
  await expect(cycle.getByRole("list", { name: "Appraisals" }).getByRole("listitem").filter({ hasText: person.name }))
    .toContainText("4.20 / 5");
});
