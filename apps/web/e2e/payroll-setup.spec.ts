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

  await page.getByRole("tab", { name: "Structures" }).click();
  const addStructure = page.getByRole("form", { name: "Add a structure" });
  await addStructure.getByLabel("Structure name").fill(`Staff ${code}`);
  await addStructure.getByLabel(`House rent ${code}`).check();
  await addStructure.getByRole("button", { name: "Add structure" }).click();
  await expect(page.getByRole("list", { name: "Structures" })).toContainText(`Staff ${code}`);

  await page.getByRole("tab", { name: "Loans & advances" }).click();
  const loan = page.getByRole("form", { name: "Record a loan or advance" });
  await loan.getByRole("combobox", { name: "Employee" }).fill(person.name);
  await page.getByRole("option", { name: person.name }).first().click();
  await loan.getByLabel("Amount (PKR)").fill("12000");
  await loan.getByLabel("Monthly instalment (PKR)").fill("3000");
  await loan.getByLabel("Note").fill(`Loan ${code}`);
  await loan.getByRole("button", { name: "Record loan" }).click();
  const row = page.getByRole("list", { name: "Loans and advances" }).getByRole("listitem").filter({ hasText: person.name }).first();
  await expect(row).toContainText("left Rs 12,000");

  await page.goto(`/hrms/employees/${person.id}`);
  const salary = page.getByRole("form", { name: "Change salary" });
  await expect(salary).toBeVisible({ timeout: 15_000 });
  await salary.getByLabel("Monthly salary (PKR)").fill("85000");
  await salary.getByLabel("Structure").selectOption({ label: `Staff ${code}` });
  await salary.getByRole("button", { name: "Save salary" }).click();
  await expect(page.getByRole("list", { name: "Salary history" })).toContainText("Rs 85,000");
});
