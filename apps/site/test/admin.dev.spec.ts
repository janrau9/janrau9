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
