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
// the mark and one lattice cell is the sky's. The cell is placed only where it clears the text,
// so on a small phone field a visit may have none; the j's dot is always there.
for (const [label, width] of [
  ["phone", 375],
  ["table", 800],
  ["room", 1280],
] as const)
  test(`home's seals on ${label}: the j's dot, and at most one lattice cell`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/", { waitUntil: "networkidle" });
    const found = (await seals(page)).map((c) =>
      String(c).includes("seal-cell") ? "seal-cell" : String(c).includes("tittle") ? "tittle" : String(c),
    );
    expect(found.filter((f) => f === "tittle")).toHaveLength(1);
    expect(found.filter((f) => f !== "tittle" && f !== "seal-cell")).toEqual([]);
    expect(found.filter((f) => f === "seal-cell").length).toBeLessThanOrEqual(1);
    await expect(page.locator("h1 .tittle")).toBeVisible();
  });

test("on wide screens the lattice always has its red cell", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  for (let visit = 0; visit < 3; visit++) {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".seal-cell")).toHaveCount(1);
  }
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
    for (let visit = 0; visit < 6; visit++) {
      await page.setViewportSize({ width, height: 720 });
      await page.goto("/", { waitUntil: "networkidle" });
      const underText = await page.evaluate(() => {
        const seal = document.querySelector(".seal-cell")?.getBoundingClientRect();
        if (!seal) return false; // no red cell this visit is allowed; a red cell under text is not
        return [...document.querySelectorAll(".hero h1, .hero p, .hero li, .hero a, .hero button")]
          .map((e) => e.getBoundingClientRect())
          .some((r) => seal.right > r.left && seal.left < r.right && seal.bottom > r.top && seal.top < r.bottom);
      });
      expect(underText, `width ${width}, visit ${visit + 1}`).toBe(false);
    }
  }
});

// The hand-off: on a page whose heading carries the seal, the nav's j-dot rests in ink and
// takes the seal only while the heading's dot is out of view, so the view still has one.
for (const [label, path] of [
  ["home", "/"],
  ["a tailored page", "/for/acme-events-t3st1?preview"],
] as const)
  test(`${label} hands the seal to the nav when its heading scrolls away`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 375, height: 640 });
    await page.goto(path, { waitUntil: "networkidle" });
    const seal = await page.evaluate(() => {
      const p = document.createElement("div");
      p.style.color = "var(--seal)";
      document.body.append(p);
      const c = getComputedStyle(p).color;
      p.remove();
      return c;
    });
    const nav = page.locator(".strip .tittle");
    await expect(nav).not.toHaveCSS("background-color", seal);
    await page.mouse.wheel(0, 1200);
    await expect(page.locator("h1 .tittle")).not.toBeInViewport();
    await expect(nav).toHaveCSS("background-color", seal);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(nav).not.toHaveCSS("background-color", seal);
  });

test("striking the red lattice cell opens elevator mode on a ripple", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/", { waitUntil: "networkidle" });
  const box = await page.locator(".seal-cell").boundingBox();
  if (!box) throw new Error("no red cell on a wide screen");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("#elevator")).toHaveAttribute("open", "");
  await expect(page.locator("#el-q")).toBeFocused();
  // The ripple's ring is gone once the room has landed.
  await expect(page.locator(".el-ripple")).toHaveCount(0);
  await page.keyboard.press("Escape");
  // While the room arrived its canvas drew the lattice's hairlines; back on the page, the lattice draws its own.
  await expect(page.locator("html")).not.toHaveClass(/\blattice-handed\b/);
  await expect(page.locator("#lattice .lattice")).toBeVisible();
  // A click elsewhere on the lattice is only a wave.
  await page.mouse.click(box.x + box.width / 2 + 120, box.y + box.height / 2);
  await expect(page.locator("#elevator")).not.toHaveAttribute("open", "");
});
