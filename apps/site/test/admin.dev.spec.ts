import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// The dashboard's islands, against the dev server and local D1 (seeded: Event Test is "applied").
test.describe.configure({ mode: "serial" });

test("a status change is confirmed by the server and moves the funnel", async ({ page }) => {
  await page.goto("/admin");
  const row = page.locator("tr", { hasText: "Event Test" });
  const save = row.getByRole("button", { name: "Save" });
  const interview = page.locator('[data-stage="Interview"]');

  await expect(save).toBeDisabled();
  await row.locator("select").selectOption("interview");
  await expect(row.getByRole("status")).toHaveText("Unsaved: was applied");
  await expect(save).toBeEnabled();

  const before = Number(await interview.textContent());
  await save.click();
  await expect(row.getByRole("status")).toHaveText("Saved ✓ interview");
  await expect(interview).toHaveText(String(before + 1));
  await expect(row.getByRole("status")).toHaveText("", { timeout: 3000 });

  await page.reload();
  await expect(row.locator("select")).toHaveValue("interview");
});

test("a failed save keeps the choice, says what is still saved, and can retry", async ({ page }) => {
  await page.goto("/admin");
  const row = page.locator("tr", { hasText: "Event Test" });
  await page.route("**/admin/status", (r) =>
    r.fulfill({ status: 503, json: { ok: false, message: "The database is unavailable." } }),
  );
  await row.locator("select").selectOption("applied");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByRole("status")).toHaveText(
    "Not saved: The database is unavailable. Still interview in the database.",
  );
  await expect(row.locator("select")).toHaveValue("applied");

  await page.unroute("**/admin/status");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByRole("status")).toHaveText("Saved ✓ applied");
});

test("copy link puts the public link on the clipboard, without ?preview", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/admin");
  const button = page.locator("tr", { hasText: "Event Test" }).locator("copy-link button");
  await button.click();
  await expect(button).toHaveText("Copied ✓");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://janrau.dev/for/event-test-ev3nt");
  await expect(button).toHaveText("Copy link", { timeout: 3000 });
});

test("stage, review, publish: a new application goes public only when published", async ({ page, request }) => {
  const fixture = (n: string) => readFileSync(new URL(`fixtures/${n}`, import.meta.url), "utf8");
  const pdf = Buffer.from("%PDF-1.7 test").toString("base64");
  const text = `${fixture("acme.post.txt")}\nStaged at ${Date.now()}.`;
  const staged = await request.post("/admin/api/stage", {
    data: {
      variant: JSON.parse(fixture("acme.variant.json")),
      post: { text },
      pdfs: { page: pdf, cv: pdf, letter: pdf },
      cvVersion: "test",
    },
  });
  expect(staged.status()).toBe(200);
  const { slug } = (await staged.json()) as { slug: string };

  expect((await request.get(`/for/${slug}`)).status()).toBe(404);
  await page.goto(`/admin/review/${slug}`);
  await expect(page.getByRole("status").first()).toHaveText("Not published: only you can see this page.");
  const download = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Cover letter (PDF)" }).click(),
  ]);
  expect(download[0].suggestedFilename()).toBe("Janrau-Beray-Cover-Letter-Acme-Events.pdf");

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("status").first()).toHaveText(`Live ✓ janrau.dev/for/${slug}`);
  expect((await request.get(`/for/${slug}`)).status()).toBe(200);
});

test("unpublish asks first, takes the link offline, and publishing again restores it", async ({ page, request }) => {
  const fixture = (n: string) => readFileSync(new URL(`fixtures/${n}`, import.meta.url), "utf8");
  const pdf = Buffer.from("%PDF-1.7 test").toString("base64");
  const text = `${fixture("acme.post.txt")}\nUnpublish test ${Date.now()}.`;
  const staged = await request.post("/admin/api/stage", {
    data: {
      variant: JSON.parse(fixture("acme.variant.json")),
      post: { text },
      pdfs: { page: pdf, cv: pdf, letter: pdf },
      cvVersion: "test",
    },
  });
  const { slug } = (await staged.json()) as { slug: string };
  await request.post("/admin/api/publish", { data: { slug } });
  expect((await request.get(`/for/${slug}`)).status()).toBe(200);

  await page.goto(`/admin/review/${slug}`);
  await page.getByRole("button", { name: "Unpublish" }).click();
  await page.getByRole("button", { name: "Keep it live" }).click();
  expect((await request.get(`/for/${slug}`)).status()).toBe(200);

  await page.getByRole("button", { name: "Unpublish" }).click();
  await page.getByRole("button", { name: "Take it offline" }).click();
  await expect(page.getByRole("status").first()).toHaveText(/^Offline ✓/);
  expect((await request.get(`/for/${slug}`)).status()).toBe(404);

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("status").first()).toHaveText(`Live ✓ janrau.dev/for/${slug}`);
  expect((await request.get(`/for/${slug}`)).status()).toBe(200);
});

test("a follow-up is recorded by the server and answers the reminder in place", async ({ page }) => {
  // Seeded "applied" and published at time 0, so its no-reply reminder is due.
  await page.goto("/admin");
  const reminder = page.locator(".next li", { hasText: "Acme Events" });
  await expect(reminder).toContainText("No reply");
  await reminder.getByRole("button", { name: "I followed up" }).click();
  await expect(reminder.getByRole("status")).toContainText("Followed up ✓");
  await page.reload();
  await expect(page.locator(".next li", { hasText: "Acme Events" })).toHaveCount(0);
});
