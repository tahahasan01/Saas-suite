import { expect, test, type Page } from "@playwright/test";
// apiPath matches the API call only — a bare regex also caught the page
// navigation of the same path.
import { API, apiPath, ready } from "./helpers";

type Payslip = { employee_id: string; name: string; net_minor: number };
type Payroll = { month: string; working_days: number; payslips: Payslip[] };

// The business month is Pakistan's, as the page computes it.
const monthPKT = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
const yearPKT = () => monthPKT().slice(0, 4);
// money() shows whole rupees when whole, paisa otherwise; compare digits only so
// the test doesn't depend on the currency symbol or grouping.
const digits = (s: string) => s.replace(/\D/g, "");
const moneyDigits = (minor: number) => String(Math.round(minor) % 100 === 0 ? Math.round(minor) / 100 : Math.round(minor));
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.describe("payroll on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows each employee's net pay without page overflow", async ({ page, request }) => {
    const res = await request.get(`${API}/hrms/payroll?month=${monthPKT()}`);
    expect(res.ok()).toBeTruthy();
    const run: Payroll = await res.json();
    expect(run.payslips.length).toBeGreaterThan(0);

    await page.goto("/hrms/payroll");
    for (const p of run.payslips) {
      const card = page.getByRole("listitem").filter({ hasText: p.name });
      await expect(card).toBeVisible();
      expect(digits(await card.innerText())).toContain(moneyDigits(p.net_minor));
      const box = await card.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test("says it's loading, not 'no employees', while the run computes", async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(apiPath("/hrms/payroll"), async (route) => { await held; await route.continue(); });
    await page.goto("/hrms/payroll");
    await expect(page.getByRole("status", { name: /loading/i })).toBeVisible();
    await expect(page.getByText(/no employees/i)).toHaveCount(0);
    release();
    await expect(page.getByRole("status", { name: /loading/i })).toHaveCount(0);
  });

  test("shows the failure, not an empty list, when the run fails", async ({ page }) => {
    await page.route(apiPath("/hrms/payroll"), (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Payroll engine is down" }) }));
    await page.goto("/hrms/payroll");
    await expect(page.getByRole("alert").filter({ hasText: "Payroll engine is down" })).toBeVisible();
    await expect(page.getByText(/no employees/i)).toHaveCount(0);
  });

  test("the month is labelled, defaults to this month, and steps back", async ({ page }) => {
    const first = page.waitForRequest((r) => r.url().includes(`/hrms/payroll?month=${monthPKT()}`));
    await page.goto("/hrms/payroll");
    await first;
    await expect(page.getByLabel("Month", { exact: true })).toHaveValue(monthPKT());
    const [y, m] = monthPKT().split("-").map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    const stepped = page.waitForRequest((r) => r.url().includes(`/hrms/payroll?month=${prev}`));
    await page.getByRole("button", { name: "Previous month" }).click();
    await stepped;
  });
});

test.describe("payroll on a tablet", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("the table scrolls inside its box with the employee column pinned", async ({ page }) => {
    await page.goto("/hrms/payroll");
    const table = page.getByRole("table", { name: /payroll/i });
    await expect(table).toBeVisible();
    const pos = await table.locator("thead th").first().evaluate((el) => getComputedStyle(el).position);
    expect(pos).toBe("sticky");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("payroll on a laptop", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("net pay is visible without scrolling the table, and no tax reads as —", async ({ page }) => {
    // Long names and big amounts (the large-data tenant) widen every column;
    // net pay, the last one, used to sit past the table's scroll edge.
    await page.route(apiPath("/hrms/payroll"), async (route) => {
      const res = await route.fetch();
      const run = await res.json();
      for (const p of run.payslips) {
        for (const k of ["gross_minor", "net_minor"]) p[k] = p[k] * 100 + 45;
        p.absence_deduction_minor = 12_345_645;
        p.tax_minor = 0;
        p.paid_leave_days = 3;
        p.unpaid_leave_days = 2;
        p.name = `Chaudhry Muhammad Usman Ghani Warraich ${p.name}`;
      }
      await route.fulfill({ response: res, json: run });
    });
    await page.goto("/hrms/payroll");
    const table = page.getByRole("table", { name: /payroll/i });
    await expect(table).toBeVisible();
    const net = table.getByRole("columnheader", { name: "Net pay" });
    await expect(net).toBeInViewport({ ratio: 1 });
    await expect(table.getByText(/^−\s*Rs\s*0$/)).toHaveCount(0);
  });
});

test.describe("payroll and leave on a 320 phone", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("summary tiles keep each amount on one line, inside the tile", async ({ page }) => {
    // A shop-sized payroll: the sample amounts are too small to wrap. Scale
    // them so the totals reach 8 digits (Rs 12,345,678).
    await page.route(apiPath("/hrms/payroll"), async (route) => {
      const res = await route.fetch();
      const run = await res.json();
      for (const p of run.payslips) {
        for (const k of Object.keys(p)) if (k.endsWith("_minor")) p[k] = p[k] * 1000 + 45;
      }
      await route.fulfill({ response: res, json: run });
    });
    await page.goto("/hrms/payroll");
    await ready(page);
    for (const label of ["Employees", "Gross", "Deductions & tax", "Net to pay"]) {
      const v = page.getByText(label, { exact: true }).locator("xpath=following-sibling::p[1]");
      await expect(v).toBeVisible();
      const fits = await v.evaluate((el) => {
        const lh = parseFloat(getComputedStyle(el).lineHeight);
        return { oneLine: el.getBoundingClientRect().height < lh * 1.5, inside: el.scrollWidth <= el.clientWidth + 1 };
      });
      expect(fits, label).toEqual({ oneLine: true, inside: true });
    }
  });

  test("a leave card shows the end date in full", async ({ page, request }) => {
    const [emp] = await (await request.get(`${API}/hrms/employees`)).json();
    // Far future and random, so reruns on the same tenant never overlap.
    const y = 2100 + Math.floor(Math.random() * 800);
    const res = await request.post(`${API}/hrms/leave`, {
      data: { employee_id: emp.id, request_type: "leave", leave_type: "unpaid", from_date: `${y}-03-02`, to_date: `${y}-03-13` },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    await page.goto("/hrms/leave");
    await ready(page);
    const dates = page.getByRole("listitem").locator("dd").filter({ hasText: `${y}-03-13` });
    await expect(dates).toBeVisible();
    expect(await dates.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  });
});

test.describe("attendance on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  // Nobody in yet, so every row offers "Check in" whatever the sample data says.
  const nobodyIn = (page: Page) =>
    page.route(apiPath("/hrms/attendance"), (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
        : route.continue());

  test("check-in buttons are full-size touch targets", async ({ page }) => {
    await nobodyIn(page);
    await page.goto("/hrms/attendance");
    const btn = page.getByRole("button", { name: /^check in/i }).first();
    await expect(btn).toBeVisible();
    expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test("a refused check-in says why", async ({ page }) => {
    await nobodyIn(page);
    await page.route(apiPath("/hrms/attendance/checkin"), (route) =>
      route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ detail: "Outside the office geofence" }) }));
    await page.goto("/hrms/attendance");
    await page.getByRole("button", { name: /^check in/i }).first().click();
    await expect(page.getByText("Outside the office geofence").first()).toBeVisible();
  });

  test("week statuses are not colour-only", async ({ page }) => {
    await page.goto("/hrms/attendance");
    const grid = page.getByRole("table", { name: /this week/i });
    await expect(grid).toBeVisible();
    const cells = grid.locator("tbody td:not(:first-child)");
    expect(await cells.count()).toBeGreaterThan(0);
    for (const text of await cells.allInnerTexts()) expect(text.trim()).not.toBe("");
  });
});

test.describe("leave", () => {
  test("filters say which one is on", async ({ page }) => {
    await page.goto("/hrms/leave");
    await ready(page); // a click while the list is still loading was lost once on Firefox under load
    await expect(page.getByRole("button", { name: "All", pressed: true })).toBeVisible();
    await page.getByRole("button", { name: "Work from home" }).click();
    await expect(page.getByRole("button", { name: "Work from home", pressed: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "All", pressed: false })).toBeVisible();
  });
});

test.describe("holidays", () => {
  test("fixed national holidays are offered for this year", async ({ page }) => {
    await page.goto("/hrms/holidays");
    await expect(page.getByLabel("Year")).toHaveValue(yearPKT());
    await expect(page.getByRole("heading", { name: new RegExp(`public holidays ${yearPKT()}`) })).toBeVisible();
  });

  test("removing a holiday asks first, because it changes payroll", async ({ page, request }) => {
    const res = await request.post(`${API}/hrms/holidays`, { data: { holiday_date: "2099-12-30", name: "E2E removal check" } });
    expect(res.ok()).toBeTruthy();
    const { id } = await res.json();
    try {
      await page.goto("/hrms/holidays");
      const row = page.getByRole("listitem").filter({ hasText: "E2E removal check" });
      await row.getByRole("button", { name: /remove/i }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: /cancel/i }).click();
      await expect(dialog).toBeHidden();
      await expect(row).toBeVisible();
    } finally {
      await request.delete(`${API}/hrms/holidays/${id}`);
    }
  });
});

test.describe("staff", () => {
  test("a failed add says why and keeps the form", async ({ page }) => {
    await page.route(apiPath("/hrms/employees"), (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ detail: "CNIC is not valid" }) })
        : route.continue());
    await page.goto("/hrms");
    await page.getByRole("button", { name: "Add employee" }).click();
    await page.getByLabel("Name").fill("E2E Never Saved");
    await page.getByRole("button", { name: "Save employee" }).click();
    await expect(page.getByText("CNIC is not valid").first()).toBeVisible();
    await expect(page.getByLabel("Name")).toHaveValue("E2E Never Saved");
  });
});
