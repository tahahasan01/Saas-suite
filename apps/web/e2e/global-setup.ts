import { request } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";

const API = process.env.API_URL ?? "http://localhost:4000";
const STATE = "e2e/.auth/state.json";
const REUSE_FOR_MS = 6 * 60 * 60 * 1000;

/** A throwaway tenant with every module and sample data, so tests never touch
 *  real accounts. Reused for a few hours while its session is still valid —
 *  signup is rate-limited, and parallel runs would trip it. */
export default async function globalSetup() {
  if (!process.env.E2E_FRESH_TENANT && existsSync(STATE) && Date.now() - statSync(STATE).mtimeMs < REUSE_FOR_MS) {
    const probe = await request.newContext({ storageState: STATE });
    const me = await probe.get(`${API}/auth/me`);
    await probe.dispose();
    if (me.ok()) return;
  }

  const ctx = await request.newContext();
  const res = await ctx.post(`${API}/auth/signup`, {
    data: {
      company_name: "E2E Traders",
      industry_type: "retail",
      name: "E2E Owner",
      email: `e2e-${Date.now()}-${randomBytes(3).toString("hex")}@example.com`,
      password: randomBytes(16).toString("base64url") + "Aa1!",
      sections: ["crm", "pos", "hrms"],
      sample_data: true,
    },
  });
  if (!res.ok()) throw new Error(`signup failed: ${res.status()} ${await res.text()}`);
  mkdirSync("e2e/.auth", { recursive: true });
  writeFileSync(STATE, JSON.stringify(await ctx.storageState()));
  await ctx.dispose();
}
