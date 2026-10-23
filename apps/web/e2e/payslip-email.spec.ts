import { expect, test, type APIRequestContext } from "@playwright/test";
import { API } from "./helpers";

type Run = { id: string; kind: string; status: string; period_start: string };

/** This month's regular run, brought to approved (needs the worker running). */
async function approvedRun(request: APIRequestContext, month: string): Promise<Run | null> {
  const find = async () => ((await (await request.get(`${API}/payroll/runs`)).json()) as Run[])
    .find((r) => r.kind === "regular" && r.status !== "cancelled" && r.period_start.startsWith(month));
  let run = await find();
  if (!run) {
    const r = await request.post(`${API}/payroll/runs`, { data: { month } });
    if (!r.ok()) return null;
    run = (await r.json()) as Run;
  }
  if (run.status === "draft" || run.status === "failed") await request.post(`${API}/payroll/runs/${run.id}/calculate`);
  for (let i = 0; i < 40 && run && run.status !== "review" && !["approved", "paid", "locked"].includes(run.status); i++) {
    await new Promise((r) => setTimeout(r, 1000));
    run = await find();
  }
  if (run?.status === "review") await request.post(`${API}/payroll/runs/${run.id}/approve`);
  run = await find();
  return run && ["approved", "paid", "locked"].includes(run.status) ? run : null;
}

/* Emailing payslips (0111): once the month's run is approved, payroll emails
 * each payslip to the staff member's email on file. */
test("an approved run's payslips are emailed from the payroll screen", async ({ page, request }) => {
  const month = new Date().toISOString().slice(0, 7);
  const run = await approvedRun(request, month);
  test.skip(!run, "needs the worker running to calculate the run");

  await page.goto("/hrms/payroll");
  await page.getByRole("button", { name: "Email payslips" }).click({ timeout: 20_000 });
  await expect(page.getByText(/Emailing \d+ payslip/)).toBeVisible();
});
