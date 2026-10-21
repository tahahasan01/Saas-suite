import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { API, ready } from "./helpers";

/* 3F: the employee profile, departments, documents, sites and kiosks, leave
   types and half days, holiday import, corrections. Each test makes what it
   needs through the API with a unique name, so tests stay independent. */

const uniq = () => Math.random().toString(36).slice(2, 8);
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function newEmployee(request: APIRequestContext, extra: Record<string, unknown> = {}) {
  const res = await request.post(`${API}/hrms/employees`, { data: { name: `E2E Staff ${uniq()}`, ...extra } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { id: string; name: string };
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test.describe("employee profile", () => {
  test("add with email and phone, open the profile, and Enable login is offered", async ({ page }) => {
    const name = `E2E Profile ${uniq()}`;
    await page.goto("/hrms");
    await ready(page);
    await page.getByRole("button", { name: "Add employee" }).click();
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Email").fill(`e2e+${uniq()}@example.com`);
    await page.getByLabel("Phone").fill("0300-1234567");
    await page.getByRole("button", { name: "Save employee" }).click();
    await expect(page.getByText("Employee added")).toBeVisible();
    await page.getByRole("link", { name }).first().click();
    // The first visit compiles the profile route in dev: wait for the navigation itself.
    await page.waitForURL(/\/hrms\/employees\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByLabel("Phone")).toHaveValue("0300-1234567");
    await expect(page.getByRole("button", { name: "Enable login" })).toBeEnabled();
  });

  test("job details save and documents show their expiry", async ({ page, request }) => {
    const emp = await newEmployee(request);
    await page.goto(`/hrms/employees/${emp.id}`);
    await ready(page);
    await page.getByLabel("Employment").selectOption("contract");
    await page.getByLabel("Employee code").fill(`C-${uniq()}`);
    await page.getByRole("button", { name: "Save job" }).click();
    await expect(page.getByText("Job saved")).toBeVisible();

    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel("Title", { exact: true }).fill("CNIC copy");
    await page.getByLabel("Expires on").fill(soon);
    await page.getByRole("button", { name: "Add document" }).click();
    await expect(page.getByText(/days left/)).toBeVisible();

    await page.goto("/hrms/employees/documents");
    await expect(page.getByRole("link", { name: emp.name }).first()).toBeVisible();
  });

  test("the profile fits a 375 phone", async ({ page, request }) => {
    const emp = await newEmployee(request);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/hrms/employees/${emp.id}`);
    await ready(page);
    await expect(page.getByRole("heading", { name: emp.name })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("departments", () => {
  test("a department can be added under another", async ({ page }) => {
    const parent = `E2E Ops ${uniq()}`;
    const child = `E2E Store ${uniq()}`;
    await page.goto("/hrms/employees/setup");
    await ready(page);
    await page.getByLabel("New department").fill(parent);
    await page.getByRole("button", { name: "Add" }).first().click();
    await expect(page.getByRole("listitem").filter({ hasText: parent }).first()).toBeVisible();
    await page.getByLabel("New department").fill(child);
    await page.getByLabel("Under").selectOption({ label: parent });
    await page.getByRole("button", { name: "Add" }).first().click();
    await expect(page.getByRole("listitem").filter({ hasText: child })).toContainText("└");
  });
});

test.describe("sites and kiosks", () => {
  test("a kiosk link is shown once and the kiosk lists the site's staff", async ({ page, request, browser }) => {
    const site = `E2E Shop ${uniq()}`;
    const loc = await (await request.post(`${API}/hrms/locations`, { data: { name: site } })).json();
    const emp = await newEmployee(request);
    await request.patch(`${API}/hrms/employees/${emp.id}/job`, { data: { location_id: loc.id } });
    await request.put(`${API}/hrms/employees/${emp.id}/kiosk-pin`, { data: { pin: "2468" } });

    await page.goto("/hrms/kiosk");
    await ready(page);
    await page.getByRole("listitem").filter({ hasText: site }).getByRole("button", { name: "New kiosk" }).click();
    const url = (await page.getByTestId("kiosk-url").textContent()) ?? "";
    expect(url).toContain("/kiosk/");
    await page.getByRole("button", { name: "Done" }).click();

    // The device: no session, only the link.
    const device = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const kiosk = await device.newPage();
    try {
      await kiosk.goto(url);
      await expect(kiosk.getByRole("heading", { name: site })).toBeVisible();
      await kiosk.getByRole("button", { name: emp.name }).click();
      await kiosk.getByLabel("Your PIN").fill("1111");
      await kiosk.getByRole("button", { name: "OK" }).click();
      // Next's route announcer is also role=alert: pick the kiosk's own message.
      await expect(kiosk.getByRole("alert").filter({ hasText: "PIN" })).toBeVisible();
      await kiosk.getByLabel("Your PIN").fill("2468");
      await kiosk.getByRole("button", { name: "OK" }).click();
      await expect(kiosk.getByRole("status")).toContainText("Welcome");
    } finally {
      await device.close();
    }
  });
});

test.describe("leave v2", () => {
  test("leave types are listed with their verify note, and a half day costs half", async ({ page, request }) => {
    const emp = await newEmployee(request);
    await page.goto("/hrms/leave");
    await ready(page);
    await expect(page.getByRole("heading", { name: "Leave types" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Casual leave" }).first()).toBeVisible();

    await page.getByLabel("Employee").selectOption({ label: emp.name });
    // The label wraps its select, so its text includes the options: match the combobox by role.
    await page.getByRole("combobox", { name: /^Type/ }).selectOption({ label: "Casual leave" });
    // A Monday well ahead, so it's a working day.
    const d = new Date(Date.UTC(2030, 2, 4)).toISOString().slice(0, 10);
    await page.getByRole("textbox", { name: "From", exact: true }).fill(d);
    await page.getByRole("combobox", { name: /^Day/ }).selectOption("am");
    await page.getByRole("button", { name: "Submit request" }).click();
    const row = page.getByRole("row").filter({ hasText: emp.name }).first();
    await expect(row).toContainText("½ day");
    await expect(row).toContainText("morning");
  });
});

test.describe("holidays v2", () => {
  test("a CSV list imports into the chosen calendar and bad lines are named", async ({ page }) => {
    await page.goto("/hrms/holidays");
    await ready(page);
    const year = await page.getByLabel("Year").inputValue();
    const name = `E2E Import ${uniq()}`;
    // A reused tenant keeps earlier runs' holidays (one per date): pick a fresh day.
    const day = `${year}-11-${String(1 + Math.floor(Math.random() * 28)).padStart(2, "0")}`;
    await page.getByLabel("CSV", { exact: true }).fill(`Date,Name\n${day},${name}\nnope,Broken\n`);
    await page.getByRole("button", { name: "Import into this calendar" }).click();
    await expect(page.getByRole("status").filter({ hasText: "added" })).toContainText("Line 3");
    await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  });
});
