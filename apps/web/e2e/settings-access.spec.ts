import { expect, request as pwRequest, test, type APIRequestContext, type Browser } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { API, ready } from "./helpers";

// Modules on/off, roles and team roles change the whole workspace, so this
// file works on its own throwaway tenant (CRM only, no sample data) instead of
// the shared e2e tenant other specs rely on.
test.describe.configure({ mode: "serial" });

const PASSWORD = randomBytes(12).toString("base64url") + "Aa1!";
let owner: APIRequestContext;
let ownerState: Awaited<ReturnType<APIRequestContext["storageState"]>>;

test.beforeAll(async () => {
  owner = await pwRequest.newContext();
  const res = await owner.post(`${API}/auth/signup`, {
    data: {
      company_name: "Access Co", industry_type: "retail", name: "Access Owner",
      email: `e2e-access-${Date.now()}-${randomBytes(3).toString("hex")}@example.com`,
      password: PASSWORD, sections: ["crm"], sample_data: false,
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  ownerState = await owner.storageState();
});

test.afterAll(async () => {
  await owner?.dispose();
});

async function ownerPage(browser: Browser) {
  const ctx = await browser.newContext({ storageState: ownerState, viewport: { width: 1366, height: 768 } });
  return { ctx, page: await ctx.newPage() };
}

test("turning a module on previews what comes with it, and the nav follows", async ({ browser }) => {
  const { ctx, page } = await ownerPage(browser);
  await page.goto("/settings/sections");
  await ready(page);
  const nav = page.getByRole("navigation").first();
  await expect(nav.getByRole("link", { name: /point of sale/i })).toHaveCount(0);

  await page.getByRole("switch", { name: /pos & inventory module/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("enable-plan")).toContainText(/products/i);
  await expect(dialog.getByTestId("enable-plan")).toContainText(/purchasing/i);
  await dialog.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText(/turned on/i)).toBeVisible();
  await expect(nav.getByRole("link", { name: /point of sale/i })).toBeVisible();
  await expect(page.getByRole("switch", { name: /pos & inventory module/i })).toHaveAttribute("aria-checked", "true");

  // Off again: nothing is deleted, and the nav drops it.
  await page.getByRole("switch", { name: /pos & inventory module/i }).click();
  await expect(page.getByRole("dialog").getByTestId("disable-plan")).toContainText(/nothing is deleted/i);
  await page.getByRole("dialog").getByRole("button", { name: /^Turn off/ }).click();
  await expect(nav.getByRole("link", { name: /point of sale/i })).toHaveCount(0);
  await ctx.close();
});

test("a new role gets permissions at a scope and keeps them", async ({ browser }) => {
  const { ctx, page } = await ownerPage(browser);
  await page.goto("/settings/roles");
  await ready(page);
  await page.getByRole("button", { name: "New role" }).click();
  await page.getByRole("dialog").getByLabel("Role name").fill("Store helper");
  await page.getByRole("dialog").getByRole("button", { name: "Add role" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#main").getByLabel("Role name")).toHaveValue("Store helper");

  await page.getByRole("checkbox", { name: /see leads/i }).check();
  await page.getByLabel("Scope for crm.lead.read").selectOption("own");
  await page.getByRole("button", { name: "Save role" }).click();
  await expect(page.getByText("Role saved")).toBeVisible();

  await page.reload();
  await ready(page);
  await page.getByRole("button", { name: /store helper/i }).click();
  await expect(page.getByRole("checkbox", { name: /see leads/i })).toBeChecked();
  await expect(page.getByLabel("Scope for crm.lead.read")).toHaveValue("own");
  await ctx.close();
});

test("someone can hold several roles", async ({ browser }) => {
  const roles = await (await owner.get(`${API}/team/roles`)).json() as { id: string; name: string }[];
  const reader = await (await owner.post(`${API}/team/roles`, { data: { name: "Reader", permissions: { crm: ["read"] } } })).json();
  const res = await owner.post(`${API}/team/users`, {
    data: { name: "Sana Clerk", email: `sana-${Date.now()}@example.com`, password: PASSWORD, role_id: reader.id },
  });
  expect(res.ok()).toBeTruthy();
  const helper = roles.find((r) => r.name === "Store helper");
  expect(helper).toBeTruthy();

  const { ctx, page } = await ownerPage(browser);
  await page.goto("/settings/team");
  await ready(page);
  await page.getByRole("button", { name: "Change roles for Sana Clerk" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: "Store helper" }).check();
  await dialog.getByRole("button", { name: "Save roles" }).click();
  await expect(page.getByText(/roles updated for sana clerk/i)).toBeVisible();
  await expect(page.getByRole("row", { name: /sana clerk/i })).toContainText(/Reader, Store helper/);
  await ctx.close();
});

test("a teammate without the roles permission sees no roles controls", async ({ browser }) => {
  const reader = await (await owner.post(`${API}/team/roles`, {
    data: { name: "Viewer", permissions: { crm: ["read"], settings: ["read"] } } })).json();
  const email = `viewer-${Date.now()}@example.com`;
  expect((await owner.post(`${API}/team/users`, {
    data: { name: "Vee", email, password: PASSWORD, role_id: reader.id } })).ok()).toBeTruthy();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const login = await ctx.request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const page = await ctx.newPage();
  await page.goto("/settings/team");
  await ready(page);
  await expect(page.getByRole("button", { name: /change roles for/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Roles", exact: true })).toHaveCount(0);
  // Modules are visible but read-only: no switches without settings.modules.manage.
  await page.goto("/settings/sections");
  await ready(page);
  await expect(page.getByRole("heading", { name: "Apps", exact: true })).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);
  await ctx.close();
});
