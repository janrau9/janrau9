import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { termIds } from "../src/lib/elevator-terms";

// Elevator mode end to end: the real model, runtime and index, served by the preview Worker
// under the production Content-Security-Policy (which `astro preview` doesn't apply itself).
const headers = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
const CSP = headers.match(/Content-Security-Policy: (.+)/)?.[1] ?? "";
const MODEL_LOAD = 120_000;
test.setTimeout(MODEL_LOAD + 30_000);

test.beforeEach(async ({ page }) => {
  // Pages and scripts get the CSP; the 35 MB of model files pass through untouched.
  await page.route(
    (url) => !url.pathname.startsWith("/elevator/"),
    async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": CSP } });
    },
  );
});

// The worker and beacons may still be loading when a test ends; that's not a failure.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

/** Console errors include CSP violations; elevator mode must cause none. */
function errorsOf(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function ask(page: Page, q: string) {
  await page.fill("#el-q", q);
  await page.keyboard.press("Enter");
}

test("the / key opens it, Escape returns focus to the page", async ({ page }) => {
  await page.goto("/work/slash");
  await page.keyboard.press("/");
  await expect(page.locator("#elevator")).toHaveAttribute("open", "");
  await expect(page.locator("#el-q")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#elevator")).not.toHaveAttribute("open", "");
});

test("a desktop question is answered by the local model under the CSP, and only the term id is counted", async ({
  page,
}) => {
  const errors = errorsOf(page);
  const counted: string[] = [];
  page.on("request", (r) => r.url().endsWith("/q") && counted.push(r.postData() ?? ""));
  await page.goto("/");
  await page.click("#elevator-open");
  // Asked before the model is ready: the question waits, and the trace says so.
  await ask(page, "go lang");
  await expect(page.locator(".el-answer")).toContainText("Go isn't in my work yet. Closest: TypeScript and C.", {
    timeout: MODEL_LOAD,
  });
  await page.click(".el-trace summary");
  for (const step of ["Index", "Runtime", "Model", "Warm-up", "Embed", "Rank", "Compose"])
    await expect(page.locator(".el-span .el-what", { hasText: step }).first()).toBeVisible();
  await expect(page.locator(".el-span", { hasText: "Your question" })).toContainText(
    "Answered as soon as the model was ready",
  );
  await expect.poll(() => counted).toEqual(['{"terms":["go"]}']);
  expect(errors).toEqual([]);
});

test("a misspelling asks “did you mean”, and the suggestion asks again", async ({ page }) => {
  await page.goto("/");
  await page.click("#elevator-open");
  await ask(page, "kubernets");
  const suggestion = page.locator(".el-answer button[data-ask='Kubernetes']");
  await expect(suggestion).toBeVisible({ timeout: MODEL_LOAD });
  await suggestion.click();
  await expect(page.locator(".el-answer")).toContainText("Kubernetes isn't in my work yet.");
});

test("by meaning, the best 3 lead and the rest wait behind See more", async ({ page }) => {
  await page.goto("/");
  await page.click("#elevator-open");
  await ask(page, "Python backend work");
  const more = page.locator(".el-more summary");
  await expect(more).toHaveText(/See \d+ more/, { timeout: MODEL_LOAD });
  await more.click();
  await expect(page.locator(".el-more .el-quote").first()).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("it asks before downloading, and keywords-only downloads nothing", async ({ page }) => {
    const big: string[] = [];
    page.on("request", (r) => /\/elevator\/(models|runtime)\//.test(r.url()) && big.push(r.url()));
    await page.goto("/");
    await page.click("#elevator-open");
    await expect(page.locator(".el-consent")).toBeVisible();
    await expect(page.locator(".el-consent")).toContainText("46 MB");
    await page.click(".el-no");
    await ask(page, "k8s");
    await expect(page.locator(".el-answer")).toContainText("Kubernetes isn't in my work yet.");
    await page.click(".el-trace summary");
    const model = page.locator(".el-span").filter({ has: page.locator(".el-what", { hasText: /^Model/ }) });
    await expect(model).toContainText("Keywords only: nothing downloaded");
    expect(big).toEqual([]);
    // The room fits the phone: nothing scrolls sideways.
    expect(await page.locator(".el-main").evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
  });
});

test("on a tailored link, fit-table evidence says so", async ({ page }) => {
  await page.goto("/for/acme-events-t3st1");
  const evidence = await page.locator("[data-evidence]").first().getAttribute("data-evidence");
  expect(evidence).toBeTruthy();
  await page.click("#elevator-open");
  await ask(page, "testing and CI");
  await expect(page.locator(".el-answer .el-why", { hasText: "in this application" }).first()).toBeVisible({
    timeout: MODEL_LOAD,
  });
});

for (const sky of ["light", "dark"] as const)
  test(`the open room has no accessibility violations (${sky} sky)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: sky });
    await page.goto("/");
    await page.click("#elevator-open");
    await ask(page, "devops");
    await expect(page.locator(".el-answer")).toContainText("DevOps covers", { timeout: MODEL_LOAD });
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

test("the counter accepts known term ids only", () => {
  expect(termIds({ terms: ["go", "go", "kubernetes", "made-up", 3, "none", "docker"] })).toEqual([
    "go",
    "kubernetes",
    "none",
  ]);
  expect(termIds({ terms: "go" })).toEqual([]);
  expect(termIds(null)).toEqual([]);
});
