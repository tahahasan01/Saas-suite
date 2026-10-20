import { expect, request, test as setup, type APIRequestContext } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { API } from "./helpers";

/** A second throwaway tenant, seeded with a shop-sized dataset: ~200 products
 *  (long names, prices over Rs 100,000, prices with paisa), 60 staff with long
 *  names, 40 leads, 30 leave requests and some invoices. Kept apart from the
 *  main e2e tenant so the regular suite's assumptions (sample data only) hold.
 *  Reused for a few hours like the main one; seeding is skipped once the
 *  tenant already has a big catalog. */
export const LARGE_STATE = "e2e/.auth/large.json";
const REUSE_FOR_MS = 6 * 60 * 60 * 1000;

export const LONG_NAMES = [
  "Muhammad Abdul Rehman Siddiqui", "Syeda Umm-e-Habiba Zainab Bukhari", "Chaudhry Muhammad Usman Ghani Warraich",
  "Malik Ghulam Mustafa Awan", "Hafiz Muhammad Zubair Qureshi", "Rana Abdul Ghaffar Khan Rajput",
  "Mian Muhammad Shahbaz Ahmed Arain", "Khawaja Noor-ul-Hassan Butt", "Sahibzada Muhammad Fahad Ali Gillani",
  "Begum Rukhsana Kausar Chaudhry", "Sardar Abdul Qayyum Khan Leghari", "Makhdoom Syed Ali Raza Shah Hashmi",
];
const FIRST = ["Muhammad", "Abdul", "Ghulam", "Syed", "Hafiz", "Malik", "Rana", "Mian", "Ayesha", "Fatima", "Zainab", "Saima"];
const LAST = ["Siddiqui", "Qureshi", "Chaudhry", "Butt", "Awan", "Bukhari", "Rajput", "Khan Niazi", "Shah Gillani", "Warraich"];

const LONG_PRODUCTS = [
  "Shan Special Bombay Biryani Masala Family Pack Extra Hot 2 x 120 g Value Bundle",
  "Samsung Galaxy A55 5G 8GB RAM 256GB Storage Awesome Iceblue PTA Approved Official Warranty",
  "Dawlance Inverter Refrigerator 9193 LF Avante+ Noir Glass Door Hairline Silver 18 cu ft",
  "Gree Pular 1.5 Ton DC Inverter Split Air Conditioner Heat & Cool GS-18PITH11W",
  "Nestlé Milkpak UHT Full Cream Milk 1 Litre Carton Pack of 12 (Wholesale Case)",
  "Haier HWM 85-1708 8.5 kg Fully Automatic Top Load Washing Machine With Twin Mode",
];
const CATS = ["Grocery", "Electronics", "Home Appliances", "Beverages", "Personal Care", "Stationery & Office Supplies"];

const pick = <T,>(xs: T[], i: number) => xs[i % xs.length];

async function signUp(): Promise<void> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${API}/auth/signup`, {
    data: {
      company_name: "E2E Large Traders",
      industry_type: "retail",
      name: "E2E Large Owner",
      email: `e2e-large-${Date.now()}-${randomBytes(3).toString("hex")}@example.com`,
      password: randomBytes(16).toString("base64url") + "Aa1!",
      sections: ["crm", "pos", "hrms"],
      sample_data: true,
    },
  });
  if (!res.ok()) throw new Error(`signup failed: ${res.status()} ${await res.text()}`);
  mkdirSync("e2e/.auth", { recursive: true });
  writeFileSync(LARGE_STATE, JSON.stringify(await ctx.storageState()));
  await ctx.dispose();
}

async function usable(): Promise<boolean> {
  if (process.env.E2E_FRESH_TENANT || process.env.E2E_FRESH_LARGE || !existsSync(LARGE_STATE)) return false;
  if (Date.now() - statSync(LARGE_STATE).mtimeMs >= REUSE_FOR_MS) return false;
  const probe = await request.newContext({ storageState: LARGE_STATE });
  const ok = (await probe.get(`${API}/auth/me`)).ok();
  await probe.dispose();
  return ok;
}

/** Runs `fn` over `items` a few at a time — fast without hammering the dev API. */
async function inBatches<T, R>(items: T[], size: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map((t, j) => fn(t, i + j)))));
  }
  return out;
}

async function post(api: APIRequestContext, path: string, data: unknown) {
  const res = await api.post(`${API}${path}`, { data });
  expect(res.ok(), `${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
}

async function seed(api: APIRequestContext) {
  const have = await (await api.get(`${API}/pos/products`)).json();
  if (have.length >= 150) return;
  const t0 = Date.now();

  // ── 200 products ──
  await inBatches([...Array(200).keys()], 10, (i) => {
    const long = i % 8 === 0;
    const name = long ? `${pick(LONG_PRODUCTS, i / 8)} #${i}` : `Item ${String(i).padStart(3, "0")} ${pick(CATS, i)}`;
    // Every 5th is Rs 100,000+ (some Rs 1,234,567.89); every 3rd carries paisa.
    let price = 5_000 + i * 1_337;
    if (i % 5 === 0) price = 10_000_000 + i * 123_457;
    if (i % 25 === 0) price = 123_456_789;
    if (i % 3 === 0 && price % 100 === 0) price += 45;
    return post(api, "/pos/products", {
      name, sku: `LG-${i}`, barcode: String(8_900_000_000_000 + i), category: pick(CATS, i),
      price_minor: price, cost_minor: Math.round(price * 0.8),
      stock_qty: i % 17 === 0 ? 0 : i % 11 === 0 ? 2 : 50 + i, low_stock_at: 5,
    });
  });

  // ── 60 employees ──
  const emps = await inBatches([...Array(60).keys()], 10, (i) => post(api, "/hrms/employees", {
    name: i < LONG_NAMES.length ? LONG_NAMES[i] : `${pick(FIRST, i)} ${pick(FIRST, i * 7 + 3)} ${pick(LAST, i)} ${i}`,
    email: `large-staff-${i}@example.com`,
    phone: `0300${String(1_000_000 + i).slice(-7)}`,
    designation: i % 4 === 0 ? "Senior Assistant Manager Inventory & Warehouse Operations" : "Sales Associate",
    department: pick(["Sales", "Warehouse & Logistics", "Accounts and Finance", "Customer Experience"], i),
    join_date: "2024-01-15",
    // Up to Rs 1,250,000.50 a month — the widest payroll cells.
    salary_minor: i % 10 === 0 ? 125_000_050 : 3_500_000 + i * 412_345,
  }));

  // ── 40 leads, invoices on some ──
  const leads = await inBatches([...Array(40).keys()], 10, (i) => post(api, "/crm/leads", {
    name: i < LONG_NAMES.length ? LONG_NAMES[i] : `${pick(FIRST, i + 2)} ${pick(LAST, i + 5)} Lead ${i}`,
    company: i % 3 === 0 ? "Al-Noor International Textile Mills (Private) Limited Faisalabad" : `Company ${i}`,
    phone: `0321${String(2_000_000 + i).slice(-7)}`,
    email: `large-lead-${i}@example.com`,
    source: pick(["manual", "website", "whatsapp", "referral"], i),
    value_minor: i % 4 === 0 ? 987_654_321 : 25_000_000 + i * 99_999,
    force: true,
  }));
  await inBatches(leads.slice(0, 12), 6, (l: { id: string }, i) => post(api, "/crm/invoices", {
    lead_id: l.id, amount_minor: 45_678_912 + i * 1_000_001, discount_pct: i % 3 ? 0 : 7.5,
    notes: i % 2 ? "" : "Advance against purchase order PO-2026-00045 — balance on delivery",
  }));

  // ── 30 leave requests, one per employee so none overlap ──
  const today = new Date();
  const day = (offset: number) => new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  const leaves = await inBatches(emps.slice(0, 30), 10, (e: { id: string }, i) => post(api, "/hrms/leave", {
    employee_id: e.id, request_type: i % 6 === 0 ? "wfh" : "leave",
    leave_type: pick(["annual", "sick", "casual", "unpaid"], i),
    from_date: day((i % 10) - 5), to_date: day((i % 10) - 5 + (i % 3)),
    reason: i % 4 === 0 ? "Family wedding in Lahore — travelling with parents, will be reachable on phone" : "Personal",
  }));
  // Decided a few at a time, like a manager clearing a queue. A failure here is
  // reported, not fatal: the dataset is still useful without every decision.
  await inBatches(leaves.slice(0, 10), 5, async (l: { id: string; employee_name: string }, i) => {
    const res = await api.post(`${API}/hrms/leave/${l.id}/${i % 4 === 3 ? "reject" : "approve"}`);
    if (!res.ok()) console.warn(`[seed] leave decision for ${l.employee_name} → ${res.status()} ${await res.text()}`);
  });
  console.log(`[seed] large tenant seeded in ${Date.now() - t0} ms`);
}

setup("large tenant is seeded", async () => {
  if (!(await usable())) await signUp();
  const api = await request.newContext({ storageState: LARGE_STATE });
  await seed(api);
  await api.dispose();
});
