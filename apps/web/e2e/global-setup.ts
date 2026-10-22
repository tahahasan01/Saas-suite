import { request } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";

const API = process.env.API_URL ?? "http://localhost:4000";
const STATE = "e2e/.auth/state.json";
const REUSE_FOR_MS = 6 * 60 * 60 * 1000;
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
export const EMPLOYEE_STATE = "e2e/.auth/employee.json";
export const EMPLOYEE_INFO = "e2e/.auth/employee-info.json";

/** A throwaway tenant with every module and sample data, so tests never touch
 *  real accounts. Reused for a few hours while its session is still valid —
 *  signup is rate-limited, and parallel runs would trip it. */
export default async function globalSetup() {
  if (!process.env.E2E_FRESH_TENANT && existsSync(STATE) && Date.now() - statSync(STATE).mtimeMs < REUSE_FOR_MS) {
    const probe = await request.newContext({ storageState: STATE });
    const me = await probe.get(`${API}/auth/me`);
    await probe.dispose();
    if (me.ok()) {
      if (!existsSync(EMPLOYEE_STATE)) await employeeLogin();
      return;
    }
  }
  rmSync(EMPLOYEE_STATE, { force: true });       // belonged to the old tenant
  rmSync(EMPLOYEE_INFO, { force: true });

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
  await employeeLogin();
}

/** An employee's own portal login (wave A leftover), made through the real
 *  invite: HR invites a staff member, the invite mail is read from Mailpit
 *  and accepted. It needs the API to send mail to Mailpit
 *  (EMAIL_PROVIDER=smtp, SMTP_HOST=localhost, SMTP_PORT=1025); otherwise no
 *  employee state is written and the specs that need it skip. */
async function employeeLogin() {
  const owner = await request.newContext({ storageState: STATE });
  try {
    const email = `e2e-staff-${Date.now()}-${randomBytes(3).toString("hex")}@example.com`;
    const emp = await owner.post(`${API}/hrms/employees`, { data: { name: "E2E Staff", email } });
    if (!emp.ok()) return;
    const { id } = (await emp.json()) as { id: string };
    if (!(await owner.post(`${API}/hrms/employees/${id}/invite`)).ok()) return;
    const token = await inviteToken(email);
    if (!token) return;
    const staff = await request.newContext();
    const ok = await staff.post(`${API}/auth/accept-invite`, {
      data: { token, name: "E2E Staff", password: randomBytes(16).toString("base64url") + "Aa1!" },
    });
    if (ok.ok()) {
      writeFileSync(EMPLOYEE_STATE, JSON.stringify(await staff.storageState()));
      writeFileSync(EMPLOYEE_INFO, JSON.stringify({ id, name: "E2E Staff" }));
    }
    await staff.dispose();
  } finally {
    await owner.dispose();
  }
}

async function inviteToken(email: string): Promise<string | null> {
  const ctx = await request.newContext();
  try {
    for (let i = 0; i < 20; i++) {
      const found = await ctx.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).catch(() => null);
      if (!found?.ok()) return null;                       // no Mailpit: nothing to wait for
      const { messages } = (await found.json()) as { messages: { ID: string }[] };
      if (messages.length) {
        const msg = (await (await ctx.get(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as { Text: string };
        return /accept-invite\?token=([\w-]+)/.exec(msg.Text)?.[1] ?? null;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  } finally {
    await ctx.dispose();
  }
}
