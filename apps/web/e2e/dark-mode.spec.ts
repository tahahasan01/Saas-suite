import { expect, test, type Page } from "@playwright/test";
import { ready } from "./helpers";

// The dark theme is the user's stored choice (localStorage "theme"), applied by
// a pre-paint script. Every visible piece of text must clear WCAG AA against
// the background it actually sits on: 4.5:1, or 3:1 for large text.
const PAGES = ["/dashboard", "/crm", "/invoices", "/pos", "/pos/products", "/hrms", "/hrms/leave", "/hrms/payroll", "/settings/team"];
const DARK_CANVAS = "rgb(11, 19, 18)"; // --color-canvas, dark

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem("theme", "dark"); } catch { /* ignore */ }
  });
});

type Finding = { text: string; ratio: number; need: number; fg: string; bg: string; tag: string };

/** Measures every visible text run on the page against its effective background. */
async function contrast(page: Page): Promise<{ checked: number; min: number; body: number; fails: Finding[] }> {
  return page.evaluate(() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    // Any CSS colour (oklab, color-mix, color(srgb …)) → sRGB bytes via canvas.
    const rgba = (c: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const over = (top: number[], under: number[]) => {
      const a = top[3];
      return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
    };
    const ratio = (a: number[], b: number[]) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    /** Composites backgrounds from the root down to `el`; null when an image/gradient makes it unknowable. */
    const bgOf = (el: Element): number[] | null => {
      const chain: Element[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) chain.unshift(e);
      let bg = [255, 255, 255, 1];
      for (const e of chain) {
        const s = getComputedStyle(e);
        if (s.backgroundImage !== "none") return null;
        const c = rgba(s.backgroundColor);
        if (c[3] > 0) bg = over(c, bg);
      }
      return bg;
    };
    const dimmed = (el: Element) => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        if (parseFloat(getComputedStyle(e).opacity) < 1) return true;
        if ((e as HTMLButtonElement).disabled || e.getAttribute("aria-disabled") === "true") return true;
      }
      return false;
    };

    const fails: Array<{ text: string; ratio: number; need: number; fg: string; bg: string; tag: string }> = [];
    let checked = 0;
    let min = 21;
    const seen = new Set<Element>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || !n.textContent?.trim()) continue;
      seen.add(el);
      if (el.closest("script,style,noscript,svg,[aria-hidden='true'],.sr-only")) continue;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (r.width < 1 || r.height < 1 || s.visibility === "hidden" || s.display === "none") continue;
      if (r.bottom < 0 || r.right < 0 || r.left > innerWidth) continue;
      if (dimmed(el)) continue; // disabled controls are exempt (WCAG 1.4.3)
      const bg = bgOf(el);
      if (!bg) continue;
      const fg = over(rgba(s.color), bg);
      const size = parseFloat(s.fontSize);
      const large = size >= 24 || (size >= 18.66 && parseInt(s.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      const k = ratio(fg, bg);
      checked++;
      min = Math.min(min, k);
      if (k < need - 0.005) {
        fails.push({ text: n.textContent.trim().slice(0, 40), ratio: Math.round(k * 100) / 100, need,
          fg: `rgb(${fg.slice(0, 3).map(Math.round).join(",")})`, bg: `rgb(${bg.slice(0, 3).map(Math.round).join(",")})`,
          tag: `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 4).join(".")}` });
      }
    }
    const b = getComputedStyle(document.body);
    const body = ratio(over(rgba(b.color), rgba(b.backgroundColor)), rgba(b.backgroundColor));
    return { checked, min: Math.round(min * 100) / 100, body: Math.round(body * 100) / 100, fails };
  });
}

for (const route of PAGES) {
  test(`dark ${route}: dark tokens are applied and all text clears WCAG AA`, async ({ page }) => {
    await page.goto(route);
    await ready(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(DARK_CANVAS);
    // Content cards sit on the dark surface, not a stray white one.
    const whiteCards = await page.locator("main *").evaluateAll((els) =>
      els.filter((e) => getComputedStyle(e).backgroundColor === "rgb(255, 255, 255)" && e.getBoundingClientRect().width > 40).length);
    expect(whiteCards, "white backgrounds left in dark mode").toBe(0);

    const r = await contrast(page);
    console.log(`[contrast] ${route}: body ${r.body}:1, min ${r.min}:1 over ${r.checked} text runs, ${r.fails.length} below AA`);
    for (const f of r.fails) console.log(`  ${f.ratio}:1 < ${f.need} "${f.text}" ${f.fg} on ${f.bg} <${f.tag}>`);
    await page.screenshot({ path: test.info().outputPath("dark.png"), fullPage: true });
    expect(r.body).toBeGreaterThanOrEqual(4.5);
    expect(r.fails, `text below AA on ${route}`).toEqual([]);
  });
}

test("dark: the theme toggle switches back to light and remembers it", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light theme" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
});
