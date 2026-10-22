import { expect, test } from "@playwright/test";

/* An employee document keeps its scan (3F + files): upload, then open it. */
test("a document is added with its scan, and the scan opens", async ({ page, request }) => {
  const staff = await (await request.get("/api/hrms/employees")).json();
  test.skip(!Array.isArray(staff) || staff.length === 0, "needs Staff turned on with an employee");
  await page.goto(`/hrms/employees/${staff[0].id}`);
  const title = `Contract ${Date.now()}`;
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add document" }) });
  await form.getByLabel("Kind").selectOption("contract");
  await form.getByLabel("Title").fill(title);
  await form.getByLabel("Scan (PDF or photo, optional)").setInputFiles({
    name: "contract.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"),
  });
  await form.getByRole("button", { name: "Add document" }).click();
  const link = page.getByRole("link", { name: `Open scan of ${title}` });
  await expect(link).toBeVisible();
  const r = await page.request.get((await link.getAttribute("href"))!, { maxRedirects: 0 });
  expect(r.status()).toBe(302);
});
