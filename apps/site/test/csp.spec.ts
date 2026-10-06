import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// `astro preview` ignores public/_headers, so these tests apply the production
// Content-Security-Policy themselves. Without this, CSP breakage only shows up live.
const headers = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
const CSP = headers.match(/Content-Security-Policy: (.+)/)?.[1] ?? "";

test.beforeEach(async ({ page }) => {
  expect(CSP).toContain("default-src 'self'");
  await page.route("**/*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": CSP } });
  });
});

for (const path of ["/", "/work/slash", "/404"])
  test(`${path} loads with no CSP violations`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(path, { waitUntil: "networkidle" });
    expect(errors).toEqual([]);
  });

test("the sky toggle works under the CSP", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.click("#sky-toggle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#sky-toggle")).toHaveAttribute("data-sky", "dark");
  await expect(page.locator("#sky-toggle")).toHaveAccessibleName(/Sky: night/);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // Flipping back to what the system prefers stores nothing.
  await page.click("#sky-toggle");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
});
