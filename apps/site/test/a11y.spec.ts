import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = ["/", "/404"];
const SKIES = ["light", "dark"] as const;

for (const path of PAGES)
  for (const sky of SKIES)
    test(`${path} has no accessibility violations (${sky} sky)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: sky });
      await page.goto(path);
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });

test("every case study page has no accessibility violations", async ({ page }) => {
  await page.goto("/");
  const links = await page
    .locator('a[href^="/work/"]')
    .evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
  for (const href of links) {
    await page.goto(href as string);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(violations.map((v) => `${href} ${v.id}`)).toEqual([]);
  }
});

test("the CV link serves a PDF", async ({ request }) => {
  const res = await request.get("/janrau-beray-cv.pdf");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("pdf");
});

test("keyboard users can skip to the content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip")).toBeFocused();
});
