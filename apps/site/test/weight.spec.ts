import { expect, test } from "@playwright/test";

// What a first-time visitor downloads, measured in the browser: HTML, CSS, JS and
// only the font files the page actually uses. Uncompressed, so the real transfer
// (Cloudflare serves Brotli) is smaller.
const BUDGET_KB = 200;

for (const path of ["/", "/work/slash", "/404"])
  test(`${path} stays under ${BUDGET_KB} KB on first load`, async ({ page }) => {
    const sizes: Promise<number>[] = [];
    page.on("response", (res) => {
      sizes.push(
        res.body().then(
          (b) => b.length,
          () => 0,
        ),
      );
    });
    await page.goto(path, { waitUntil: "networkidle" });
    // Wait for every body to be read; summing inside the handler races the test's end.
    const kb = Math.round((await Promise.all(sizes)).reduce((a, b) => a + b, 0) / 1024);
    test.info().annotations.push({ type: "weight", description: `${path}: ${kb} KB` });
    console.log(`${path}: ${kb} KB`);
    expect(kb).toBeLessThanOrEqual(BUDGET_KB);
  });
