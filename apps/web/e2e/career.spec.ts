import { expect, test } from "@playwright/test";
import { API } from "./helpers";

/* Promotions and transfers (wave C, H30): promote someone from their profile
 * with a raise; it applies today and shows in their career history. */
test("a promotion with a raise applies today and joins the history", async ({ page, request }) => {
  const tag = Date.now().toString(36);
  const r = await request.post(`${API}/hrms/employees`, { data: { name: `Rising ${tag}`, salary_minor: 5_000_000 } });
  test.skip(!r.ok(), "needs Staff turned on");
  const person = (await r.json()) as { id: string };
  const title = (await (await request.post(`${API}/hrms/job-titles`, { data: { name: `Team lead ${tag}` } })).json()) as { id: string };

  await page.goto(`/hrms/employees/${person.id}`);
  await page.getByRole("button", { name: "Promote or transfer" }).click({ timeout: 15_000 });
  const d = page.getByRole("dialog", { name: "Promote or transfer" });
  await d.getByLabel("New job title").selectOption(title.id);
  await d.getByLabel("New monthly salary (PKR)").fill("65000");
  await d.getByLabel("Note").fill("Runs the evening shift now");
  await d.getByRole("button", { name: "Save" }).click();

  const hist = page.getByRole("list", { name: "Career history" });
  await expect(hist).toContainText(`title: — → Team lead ${tag}`);
  await expect(hist).toContainText("Rs 65,000");
  await expect(page.locator("header").filter({ hasText: `Rising ${tag}` })).toContainText(`Team lead ${tag}`);
});
