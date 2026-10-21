import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { API, ready } from "./helpers";

// Settings → My profile (3A). The password change runs as a throwaway
// teammate: changing the shared owner's password would sign out every
// other test using the same session.

test("my name saves", async ({ page }) => {
  await page.goto("/settings/profile");
  await ready(page);
  await expect(page.getByRole("heading", { name: "My profile" })).toBeVisible();
  await page.getByLabel("Your name").fill("E2E Owner");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved")).toBeVisible({ timeout: 15_000 });
});

test("changing the password signs the old one out", async ({ request, browser }) => {
  const roles = await (await request.get(`${API}/team/roles`)).json();
  const email = `mate-${Date.now()}-${randomBytes(3).toString("hex")}@example.com`;
  const oldPw = `${randomBytes(9).toString("base64url")}Aa1!`;
  const newPw = `${randomBytes(9).toString("base64url")}Bb2!`;
  const created = await request.post(`${API}/team/users`, {
    data: { name: "Mate", email, password: oldPw, role_id: roles[0].id },
  });
  expect(created.ok()).toBeTruthy();

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const mate = await ctx.newPage();
  // Through the web's own /api rewrite, so the session cookie lands on the web origin.
  const login = await mate.request.post("/api/auth/login", { data: { email, password: oldPw } });
  expect(login.ok()).toBeTruthy();

  await mate.goto("/settings/profile");
  await ready(mate);
  await mate.getByLabel("Current password").fill(oldPw);
  await mate.getByLabel("New password", { exact: true }).fill(newPw);
  await mate.getByLabel("Confirm new password").fill(`${newPw}x`);
  await expect(mate.getByText("The new passwords don't match.")).toBeVisible();
  await expect(mate.getByRole("button", { name: "Change password" })).toBeDisabled();
  await mate.getByLabel("Confirm new password").fill(newPw);
  await mate.getByRole("button", { name: "Change password" }).click();
  await expect(mate.getByText(/Password changed/)).toBeVisible({ timeout: 15_000 });

  // Still signed in here (the session was re-issued)…
  await mate.reload();
  await ready(mate);
  await expect(mate.getByRole("heading", { name: "My profile" })).toBeVisible();
  // …and the old password no longer works.
  const stale = await request.post(`${API}/auth/login`, { data: { email, password: oldPw } });
  expect(stale.status()).toBe(401);
  await ctx.close();
});
