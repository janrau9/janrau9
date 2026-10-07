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

// The home page breaks the law on purpose (shuhari, named in Lattice.astro): the j's dot is
// the mark and one lattice cell is the sky's, at every width.
for (const [label, width, expected] of [
  ["phone", 375, ["seal-cell", "tittle"]],
  ["table", 800, ["seal-cell", "tittle"]],
  ["room", 1280, ["seal-cell", "tittle"]],
] as const)
  test(`home's seals on ${label}: ${expected.join(" and ")}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/", { waitUntil: "networkidle" });
    const found = (await seals(page)).map((c) =>
      String(c).includes("seal-cell") ? "seal-cell" : String(c).includes("tittle") ? "tittle" : String(c),
    );
    expect(found.sort()).toEqual([...expected].sort());
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

test("the lattice's seal never sits under text", async ({ page }) => {
  for (const width of [375, 414, 800, 1280]) {
    for (let visit = 0; visit < 3; visit++) {
      await page.setViewportSize({ width, height: 720 });
      await page.goto("/", { waitUntil: "networkidle" });
      const underText = await page.evaluate(() => {
        const seal = document.querySelector(".seal-cell")?.getBoundingClientRect();
        if (!seal) return true;
        return [...document.querySelectorAll(".hero h1, .hero p, .hero li, .hero a, .hero button")]
          .map((e) => e.getBoundingClientRect())
          .some((r) => seal.right > r.left && seal.left < r.right && seal.bottom > r.top && seal.top < r.bottom);
      });
      expect(underText, `width ${width}, visit ${visit + 1}`).toBe(false);
    }
  }
});
