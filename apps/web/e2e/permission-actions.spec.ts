import { expect, request as pwRequest, test, type APIRequestContext } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { API, ready } from "./helpers";

/* Permission-aware actions (3G): a read-only teammate sees the pages but
 * none of the buttons that would only fail. Own tenant: roles change it. */
test.describe.configure({ mode: "serial" });

const PASSWORD = randomBytes(12).toString("base64url") + "Aa1!";
let owner: APIRequestContext;

test.beforeAll(async () => {
  owner = await pwRequest.newContext();
  const res = await owner.post(`${API}/auth/signup`, {
    data: {
      company_name: "Readonly Co", industry_type: "retail", name: "Readonly Owner",
      email: `e2e-ro-${Date.now()}-${randomBytes(3).toString("hex")}@example.com`,
      password: PASSWORD, sections: ["pos", "hrms"], sample_data: true,
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
});

test.afterAll(async () => { await owner?.dispose(); });

test("a read-only teammate sees lists but no create, edit or switch controls", async ({ browser }) => {
  const keys = ["pos.sale.read", "purchasing.po.read", "hrms.employee.read", "settings.workflows.read"];
  const role = await owner.post(`${API}/roles`, {
    data: { name: "Looker", grants: keys.map((k) => ({ permission_key: k, scope: "all" })) } });
  expect(role.ok(), await role.text()).toBeTruthy();
  const email = `looker-${Date.now()}@example.com`;
  expect((await owner.post(`${API}/team/users`, {
    data: { name: "Lou", email, password: PASSWORD, role_id: (await role.json()).id } })).ok()).toBeTruthy();

  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  expect((await ctx.request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).ok()).toBeTruthy();
  const page = await ctx.newPage();

  await page.goto("/pos/purchase-orders");
  await ready(page);
  await expect(page.getByText(/order from suppliers/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "New order" })).toHaveCount(0);

  await page.goto("/hrms");
  await ready(page);
  await expect(page.getByRole("button", { name: "Add employee" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(0);

  await page.goto("/automations");
  await ready(page);
  await expect(page.getByRole("heading", { name: "New automation" })).toHaveCount(0);
  await expect(page.getByRole("switch")).toHaveCount(0);

  await ctx.close();
});
