import { expect, test } from "@playwright/test";

// Seiza's seal law: exactly one vermilion mark per view, at every width.
const sealsOnHome = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.color = "var(--seal)";
    document.body.append(probe);
    const seal = getComputedStyle(probe).color;
    probe.remove();
    const latticeSeals = document.querySelectorAll(".hex-cell.seal-cell").length;
    const dot = document.querySelector(".dot");
    const dotIsSeal = dot ? getComputedStyle(dot).backgroundColor === seal : false;
    return latticeSeals + (dotIsSeal ? 1 : 0);
  });

for (const [label, width] of [
  ["phone", 375],
  ["table", 800],
  ["room", 1280],
] as const)
  test(`home has exactly one seal on ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/", { waitUntil: "networkidle" });
    expect(await sealsOnHome(page)).toBe(1);
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
