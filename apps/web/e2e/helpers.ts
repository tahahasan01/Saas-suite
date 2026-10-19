import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API = process.env.API_URL ?? "http://localhost:4000";

export type Product = { id: string; name: string; barcode: string | null; price_minor: number };

export async function products(request: APIRequestContext): Promise<Product[]> {
  const res = await request.get(`${API}/pos/products`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/** The cart panel: the container holding the "Cart (n)" heading. */
export function cart(page: Page) {
  return page.getByRole("heading", { name: /^Cart \(\d+\)$/ }).locator("..");
}

export function scanField(page: Page) {
  return page.getByPlaceholder(/scan barcode/i);
}

/** Types like a keyboard-wedge scanner: the whole code plus Enter in well under the search debounce. */
export async function scan(page: Page, code: string) {
  await page.keyboard.type(code, { delay: 4 });
  await page.keyboard.press("Enter");
}
