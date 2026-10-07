import { expect, type Page, test } from "@playwright/test";

/**
 * Seiza's seal law: exactly one vermilion mark per view, and never on something that reads
 * as a state. Counts every element painted in the seal colour (background or text), so a
 * stray red status dot anywhere fails, not just in the places we thought to check.
 */
async function seals(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.color = "var(--seal)";
    document.body.append(probe);
    const seal = getComputedStyle(probe).color;
    probe.remove();
    return [...document.querySelectorAll("body *")]
      .filter((el) => {
        const s = getComputedStyle(el);
        const visible = s.display !== "none" && s.visibility !== "hidden" && (el as HTMLElement).offsetParent !== null;
        return visible && (s.backgroundColor === seal || (s.color === seal && el.childNodes.length > 0));
      })
      .map((el) => el.className || el.tagName);
  });
}

for (const [label, width] of [
  ["phone", 375],
  ["table", 800],
  ["room", 1280],
] as const)
  test(`home has exactly one seal, the dot of the name's j, on ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/", { waitUntil: "networkidle" });
    expect(await seals(page)).toEqual([expect.stringContaining("tittle")]);
    await expect(page.locator("h1 .tittle")).toBeVisible();
  });

for (const [label, path] of [
  ["a tailored page", "/for/acme-events-t3st1?preview"],
  ["a case study", "/work/slash"],
  ["the 404 page", "/nowhere"],
] as const)
  test(`${label} has exactly one seal`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    expect(await seals(page)).toEqual([expect.stringContaining("tittle")]);
  });

test("availability and project status are never the seal", async ({ page }) => {
  await page.goto("/for/acme-events-t3st1?preview");
  const sealColour = await page.evaluate(() => {
    const p = document.createElement("div");
    p.style.color = "var(--seal)";
    document.body.append(p);
    return getComputedStyle(p).color;
  });
  expect(await page.locator(".avail .dot").evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(sealColour);
});

test("screen readers hear the name, not the dotless j", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("janrau beray");
});

test("the lattice keeps whole cells only, inside its field", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/", { waitUntil: "networkidle" });
  const outside = await page.evaluate(() => {
    const field = document.getElementById("lattice")?.getBoundingClientRect();
    if (!field) return -1;
    return [...document.querySelectorAll(".hex-cell")].filter((c) => {
      const r = c.getBoundingClientRect();
      return (
        r.left < field.left - 0.5 ||
        r.right > field.right + 0.5 ||
        r.top < field.top - 0.5 ||
        r.bottom > field.bottom + 0.5
      );
    }).length;
  });
  expect(outside).toBe(0);
  expect(await page.locator(".hex-cell").count()).toBeGreaterThan(20);
});
