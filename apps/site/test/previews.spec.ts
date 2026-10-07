import { expect, test } from "@playwright/test";
import siteData from "../src/generated/site-data.json" with { type: "json" };

// What LinkedIn, Slack or an email client shows when a link is pasted: every page must
// name a preview image that exists, is a PNG and has the size its tags declare.
const studies = siteData.work.filter((w) => !w.draft).map((w) => w.slug);
const pages = ["/", ...studies.map((s) => `/work/${s}`), "/for/acme-events-t3st1"];

for (const path of pages)
  test(`${path} has a link-preview image`, async ({ page, request }) => {
    await page.goto(`${path}${path.startsWith("/for/") ? "?preview" : ""}`);
    const meta = (p: string) => page.locator(`meta[property="${p}"]`).getAttribute("content");
    const url = new URL((await meta("og:image")) ?? "");
    expect(url.origin).toBe("https://janrau.dev");
    expect(await meta("og:image:alt")).toBeTruthy();
    expect(await page.locator('meta[name="twitter:card"]').getAttribute("content")).toBe("summary_large_image");

    const res = await request.get(url.pathname);
    expect(res.status()).toBe(200);
    const png = await res.body();
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    // PNG header: width and height are big-endian at bytes 16 and 20.
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });
