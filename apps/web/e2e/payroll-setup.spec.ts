import { expect, test } from "@playwright/test";

/* Payroll set-up (wave A, St10): a component, a structure that uses it, a
 * salary on the employee's profile, and a loan payroll will recover. */
const uid = () => Date.now().toString(36).toUpperCase().slice(-5);

test("payroll is set up from screens: component, structure, salary, loan", async ({ page, request }) => {
  const staff = await (await request.get("/api/hrms/employees")).json();
  test.skip(!Array.isArray(staff) || staff.length === 0, "needs Staff turned on with an employee");
  const person = staff[0] as { id: string; name: string };
  const code = `HR${uid()}`;

  await page.goto("/hrms/payroll/setup");
  const addComponent = page.getByRole("form", { name: "Add a pay component" });
  await expect(addComponent).toBeVisible({ timeout: 15_000 });
  await addComponent.getByLabel("Name").fill(`House rent ${code}`);
  await addComponent.getByLabel("Code").fill(code);
  await addComponent.getByLabel("Amount (PKR)").fill("5000");
  await addComponent.getByRole("button", { name: "Add component" }).click();
  await expect(page.getByRole("list", { name: "Pay components" })).toContainText(`House rent ${code}`);

  // The structure lists every earning, so it needs the salary itself (Basic = BASE) too.
  const basic = await request.post("/api/payroll/components", { data: { code: `B${code}`, name: `Basic ${code}`, calc: "formula", formula: "BASE" } });
  expect(basic.ok(), await basic.text()).toBeTruthy();

  await page.getByRole("tab", { name: "Structures" }).click();
  const addStructure = page.getByRole("form", { name: "Add a structure" });
  await addStructure.getByLabel("Structure name").fill(`Staff ${code}`);
  await addStructure.getByLabel(`House rent ${code}`).check();
  await addStructure.getByLabel(`Basic ${code}`).check();
  await addStructure.getByRole("button", { name: "Add structure" }).click();
  const structure = page.getByRole("list", { name: "Structures" }).getByRole("listitem").filter({ hasText: `Staff ${code}` });
  await expect(structure).toBeVisible();
  await expect(structure).not.toContainText("Nothing here pays the monthly salary");

  await page.getByRole("tab", { name: "Loans & advances" }).click();
  const loan = page.getByRole("form", { name: "Record a loan or advance" });
  await loan.getByRole("combobox", { name: "Employee" }).fill(person.name);
  await page.getByRole("option", { name: person.name }).first().click();
  await loan.getByLabel("Amount (PKR)").fill("12000");
  await loan.getByLabel("Monthly instalment (PKR)").fill("3000");
  await loan.getByLabel("Note").fill(`Loan ${code}`);
  await loan.getByRole("button", { name: "Record loan" }).click();
  const row = page.getByRole("list", { name: "Loans and advances" }).getByRole("listitem").filter({ hasText: `Loan ${code}` });
  await expect(row).toContainText("left Rs 12,000");
  // Paying part of it back in cash lowers what payroll will take (0107).
  await row.getByRole("button", { name: `Pay off ${person.name}'s loan` }).click();
  const pay = page.getByRole("dialog", { name: `Pay off: ${person.name}` });
  await pay.getByLabel("Amount paid (PKR)").fill("3000");
  await pay.getByRole("button", { name: "Record" }).click();
  await expect(row).toContainText("left Rs 9,000");

  await page.goto(`/hrms/employees/${person.id}`);
  const salary = page.getByRole("form", { name: "Change salary" });
  await expect(salary).toBeVisible({ timeout: 15_000 });
  await salary.getByLabel("Monthly salary (PKR)").fill("85000");
  await salary.getByLabel("Structure").selectOption({ label: `Staff ${code}` });
  await salary.getByRole("button", { name: "Save salary" }).click();
  await expect(page.getByRole("list", { name: "Salary history" })).toContainText("Rs 85,000");
});
