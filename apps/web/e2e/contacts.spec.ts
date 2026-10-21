import { expect, test, type APIRequestContext } from "@playwright/test";
import { API, cart, products, ready } from "./helpers";

type Contact = { id: string; name: string };

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** A Pakistani mobile no other test uses: 03 + 9 random digits. */
const phone = () => `03${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

async function newContact(request: APIRequestContext, data: Record<string, unknown>): Promise<Contact> {
  const res = await request.post(`${API}/contacts`, { data: { force: true, ...data } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}

test.describe("contacts", () => {
  test("the list uses the industry's word and finds a number typed another way", async ({ page, request }) => {
    const num = phone();
    const c = await newContact(request, { name: `Find Me ${uniq()}`, phone: num });
    await page.goto("/contacts");
    await ready(page);
    // A retail tenant says Customers (terminology, migration 0059).
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Customers");
    const intl = `+92 ${num.slice(1, 4)} ${num.slice(4)}`;
    await page.getByRole("searchbox", { name: /search customers/i }).fill(intl);
    await expect(page.getByRole("button", { name: `Open ${c.name}` }).first()).toBeVisible();
  });

  test("adding a duplicate shows who it matches, and can still be saved", async ({ page, request }) => {
    const num = phone();
    const first = await newContact(request, { name: `Original ${uniq()}`, phone: num });
    await page.goto("/contacts");
    await ready(page);
    await page.getByRole("button", { name: /new customer/i }).click();
    const dialog = page.getByRole("dialog", { name: /new customer/i });
    const name = `Twin ${uniq()}`;
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Phone").fill(num);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByRole("alert")).toContainText(first.name);
    await dialog.getByRole("button", { name: /save anyway/i }).click();
    await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]{36}$/, { timeout: 20_000 }); // a dev server compiles the route on first visit
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  });

  test("Contact 360 keeps notes on its timeline", async ({ page, request }) => {
    const c = await newContact(request, { name: `Noted ${uniq()}` });
    await page.goto(`/contacts/${c.id}`);
    await ready(page);
    await expect(page.getByRole("tab", { name: "Timeline" })).toHaveAttribute("aria-selected", "true");
    await page.getByLabel("Add a note").fill("Prefers a call after 5pm");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByTestId("contact-timeline")).toContainText("Prefers a call after 5pm");
    await page.getByRole("tab", { name: /^Sales/ }).click();
    await expect(page.getByText("No sales yet")).toBeVisible();
  });

  test("two records merge into one after typing MERGE", async ({ page, request }) => {
    const tag = uniq();
    const keep = await newContact(request, { name: `Keep ${tag}`, email: `keep-${tag}@shop.pk` });
    const lose = await newContact(request, { name: `Lose ${tag}`, email: `lose-${tag}@shop.pk` });
    await page.goto("/contacts");
    await ready(page);
    await page.getByRole("searchbox", { name: /search customers/i }).fill(tag);
    await expect(page.getByRole("button", { name: `Open ${keep.name}` }).first()).toBeVisible();
    await page.getByRole("checkbox", { name: `Select ${keep.name} to merge` }).first().check();
    await page.getByRole("checkbox", { name: `Select ${lose.name} to merge` }).first().check();
    await page.getByRole("button", { name: /merge selected/i }).click();
    const dialog = page.getByRole("dialog", { name: /merge 2/i });
    await expect(dialog.getByTestId("merge-moving")).toBeVisible();
    const mergeBtn = dialog.getByRole("button", { name: "Merge", exact: true });
    await expect(mergeBtn).toBeDisabled();
    await dialog.getByLabel("Type MERGE to confirm").fill("merge");
    await mergeBtn.click();
    await expect(page).toHaveURL(new RegExp(`/contacts/${keep.id}$`), { timeout: 20_000 });
    await page.goto(`/contacts/${lose.id}`);
    await expect(page.getByText(/was merged into another record/i)).toBeVisible();
  });

  test("the review queue page loads", async ({ page }) => {
    await page.goto("/contacts/review");
    await ready(page);
    await expect(page.getByRole("link", { name: "Review" })).toBeVisible();
  });

  test("a cashier attaches a customer by phone and the sale shows on their record", async ({ page, request }) => {
    const num = phone();
    const c = await newContact(request, { name: `Till Regular ${uniq()}`, phone: num });
    const [first] = await products(request);
    await page.goto("/pos");
    await ready(page);
    const side = page.getByRole("complementary", { name: "Cart" });
    await side.getByRole("button", { name: /add customer/i }).click();
    await side.getByLabel(/customer phone/i).fill(num);
    await side.getByRole("button", { name: "Find" }).click();
    await side.getByRole("button", { name: new RegExp(c.name) }).click();
    await expect(side.getByTestId("pos-customer")).toContainText(c.name);
    await page.getByRole("button", { name: new RegExp(first.name) }).first().click();
    await expect(cart(page)).toContainText(first.name);
    await page.getByRole("button", { name: /^Charge/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // The record now lists the sale.
    const detail = await (await request.get(`${API}/contacts/${c.id}`)).json();
    expect(detail.sales).toHaveLength(1);
  });
});
