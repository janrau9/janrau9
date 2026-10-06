import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { type Db, lookup } from "../src/lib/tailored";

// Served by the local Worker from local D1 and KV, seeded by scripts/seed-local.mjs.
const PAGE = "/for/acme-events-t3st1";

test("a tailored page shows the essentials above the fold on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(PAGE);
  for (const target of [
    page.getByText("Prepared for Acme Events · Software Engineer"),
    page.getByRole("heading", { level: 1 }),
    page.getByText(/Available · /),
    page.getByText("Eligible to work in Finland"),
    page.getByRole("link", { name: "Download CV" }),
  ])
    await expect(target).toBeInViewport();
});

test("a tailored page is private: noindex, not cached, with the CSP", async ({ request }) => {
  const res = await request.get(PAGE);
  expect(res.status()).toBe(200);
  expect(res.headers()["x-robots-tag"]).toContain("noindex");
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(res.headers()["content-security-policy"]).toContain("default-src 'self'");
  expect(await res.text()).toContain('name="robots" content="noindex, nofollow"');
});

test("a tailored page renders the fit table and cover note from the variant", async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.getByText("“integrations with third-party APIs”")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Why Acme Events" })).toBeVisible();
  await expect(page.getByRole("link", { name: /append-only visit log/ })).toHaveAttribute("href", "/work/slash");
});

test("a tailored page has no accessibility violations", async ({ page }) => {
  await page.goto(PAGE);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});

test("the tailored PDF is served, and the strip links to it", async ({ page, request }) => {
  const res = await request.get(`${PAGE}/cv.pdf`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  await page.goto(PAGE);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "CV" })).toHaveAttribute(
    "href",
    `${PAGE}/cv.pdf`,
  );
});

for (const [why, path] of [
  ["an unknown link", "/for/nobody-here-zzzzz"],
  ["a withdrawn application", "/for/withdrawn-co-wthdr"],
  ["a malformed slug", "/for/DROP-TABLE"],
  ["an unknown PDF", "/for/nobody-here-zzzzz/cv.pdf"],
] as const)
  test(`${why} answers 404`, async ({ request }) => {
    expect((await request.get(path, { maxRedirects: 0 })).status()).toBe(404);
  });

/** A fake D1 whose first() answers with the given function. */
const fakeDb = (first: () => Promise<unknown>): Db => ({
  prepare: () => ({
    bind: () => ({
      first: first as <T>() => Promise<T | null>,
      run: async () => ({}),
      all: async <T>() => ({ results: [] as T[] }),
    }),
  }),
});

test.describe("when the database fails", () => {
  const broken = fakeDb(() => Promise.reject(new Error("D1 is down")));

  test("the lookup reports unavailable, not missing", async () => {
    expect(await lookup(broken, "acme-events-t3st1")).toEqual({ kind: "unavailable", reason: "database: D1 is down" });
  });

  test("a missing binding is also unavailable", async () => {
    expect((await lookup(undefined, "acme-events-t3st1")).kind).toBe("unavailable");
  });

  test("a stored variant that no longer parses is unavailable", async () => {
    const corrupt = fakeDb(async () => ({ variant_json: "{nope", published_at: 0 }));
    expect((await lookup(corrupt, "acme-events-t3st1")).kind).toBe("unavailable");
  });
});
