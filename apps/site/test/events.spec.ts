import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { verifyAccess } from "../src/lib/access";
import { type ApplicationRow, classifyOpen, funnel } from "../src/lib/events";

// A fixture link of its own, so other tests' visits can't change these counts.
const SLUG = "event-test-ev3nt";
/** Browsers send Origin with beacons and form posts; Astro rejects cross-site POSTs without it. */
const ORIGIN = "http://localhost:4322";
const PHONE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";

/**
 * Query the same local D1 the preview Worker uses. It is one SQLite file, and the Worker may
 * still be writing a beacon from the test before, so a failed call is retried with backoff;
 * one that still fails after 5 attempts reports Wrangler's own message.
 */
function sql<T>(command: string): T[] {
  for (let attempt = 1; ; attempt++) {
    try {
      const out = execFileSync(
        "pnpm",
        ["exec", "wrangler", "d1", "execute", "janrau-dev", "--local", "--json", "--command", command],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      return (JSON.parse(out) as { results: T[] }[])[0]?.results ?? [];
    } catch (err) {
      const e = err as { stderr?: string; stdout?: string; message: string };
      const detail = `${e.stderr ?? ""}${e.stdout ?? ""}`.trim() || e.message;
      // The lock's wording varies by Wrangler version, so every failure is retried; a real error
      // still surfaces, with its message, after the last attempt.
      if (attempt >= 5) throw new Error(`wrangler d1 execute failed (attempt ${attempt}): ${command}\n${detail}`);
      // Back off 200, 400, 800, 1600 ms: a beacon's write takes milliseconds.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 * 2 ** attempt);
    }
  }
}
const events = () =>
  sql<{ type: string; scanner: number; reason: string | null }>(
    `SELECT type, scanner, reason FROM events WHERE slug = '${SLUG}' ORDER BY id`,
  );

test.describe.configure({ mode: "serial" });
// Only these tests read or write D1; the pure tests below never touch it.
test.describe("recording on a tailored link", () => {
  test.beforeEach(() => {
    sql(`DELETE FROM events WHERE slug = '${SLUG}'`);
  });

  test("a real phone visit counts as a person, with what they did", async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: PHONE_UA, viewport: { width: 375, height: 667 } });
    const page = await ctx.newPage();
    await page.goto(`/for/${SLUG}`);
    await page.waitForTimeout(3500);
    // Scroll as a reader would, to the fit table's middle, wherever the layout puts it.
    await page.locator("#fit").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(500);
    await ctx.close();
    await expect
      .poll(() =>
        events()
          .map((e) => e.type)
          .sort(),
      )
      .toEqual(["fit_viewed", "human", "open"]);
    // The phone's user agent is never mistaken for a scanner. (The network check depends on where
    // the test runs: CI runners sit on a cloud network and are rightly flagged "network".)
    expect(events().find((e) => e.type === "open")?.reason).not.toBe("agent");
  });

  test("an email scanner's open is flagged and never counts as a person", async ({ request }) => {
    await request.get(`/for/${SLUG}`, { headers: { "user-agent": "Mozilla/5.0 (compatible; Barracuda Sentinel)" } });
    await expect.poll(() => events()).toEqual([{ type: "open", scanner: 1, reason: "agent" }]);
  });

  test("Janrau's own signed-in visits are not recorded", async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: PHONE_UA });
    await ctx.addCookies([{ name: "CF_Authorization", value: "signed-in", url: ORIGIN }]);
    const page = await ctx.newPage();
    await page.goto(`/for/${SLUG}`);
    await page.waitForTimeout(3500);
    // Scroll as a reader would, to the fit table's middle, wherever the layout puts it.
    await page.locator("#fit").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await ctx.close();
    expect(events()).toEqual([]);
  });

  test("?preview opens are not recorded", async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: PHONE_UA });
    const page = await ctx.newPage();
    await page.goto(`/for/${SLUG}?preview`);
    await page.waitForTimeout(3500);
    await ctx.close();
    expect(events()).toEqual([]);
  });

  test("the beacon endpoint ignores junk and unknown links", async ({ request }) => {
    for (const body of [
      "not json",
      JSON.stringify({ slug: SLUG, type: "open" }),
      JSON.stringify({ slug: "nobody-zzzzz", type: "human" }),
    ])
      expect(
        (await request.post("/e", { data: body, headers: { "content-type": "text/plain", origin: ORIGIN } })).status(),
      ).toBe(204);
    expect(events()).toEqual([]);
    expect(sql<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE slug = 'nobody-zzzzz'")[0]?.n).toBe(0);
  });

  test("elevator mode records a use on the link, and counts term ids only", async ({ request }) => {
    const post = (path: string, body: unknown) =>
      request.post(path, { data: JSON.stringify(body), headers: { "content-type": "text/plain", origin: ORIGIN } });
    sql("DELETE FROM elevator_terms");
    expect((await post("/e", { slug: SLUG, type: "elevator" })).status()).toBe(204);
    expect((await post("/q", { terms: ["kubernetes", "what I typed"] })).status()).toBe(204);
    await post("/q", { terms: ["kubernetes"] });
    await expect.poll(() => events().map((e) => e.type)).toEqual(["elevator"]);
    await expect
      .poll(() => sql<{ term: string; asks: number }>("SELECT term, asks FROM elevator_terms"))
      .toEqual([{ term: "kubernetes", asks: 2 }]);
  });

  test("the first person-like read and the first CV download each notify once", async ({ request }) => {
    sql(`UPDATE applications SET notified_human_at = NULL, notified_cv_at = NULL WHERE slug = '${SLUG}'`);
    const notified = () =>
      sql<{ human: number | null; cv: number | null }>(
        `SELECT notified_human_at AS human, notified_cv_at AS cv FROM applications WHERE slug = '${SLUG}'`,
      )[0];
    const beacon = (type: string) =>
      request.post("/e", {
        data: JSON.stringify({ slug: SLUG, type }),
        headers: { "content-type": "text/plain", origin: ORIGIN },
      });

    await beacon("fit_viewed");
    await beacon("human");
    await expect.poll(() => notified()?.human).not.toBeNull();
    expect(notified()?.cv).toBeNull();
    const first = notified()?.human;
    await beacon("human");
    await beacon("cv_download");
    await expect.poll(() => notified()?.cv).not.toBeNull();
    // A second read changes nothing: the claim is the record that the email went out.
    expect(notified()?.human).toBe(first);
  });
});

test("admin refuses requests without a valid Access token", async ({ request }) => {
  expect((await request.get("/admin", { maxRedirects: 0 })).status()).toBe(403);
  // Same origin, like the dashboard's own form, so the 403 comes from the Access check.
  // A token-shaped string with no valid signature, built at runtime so it can't be mistaken for a secret.
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const forged = {
    "cf-access-jwt-assertion": [part({ alg: "RS256" }), part({ email: "me@example.com" }), "unsigned"].join("."),
    origin: ORIGIN,
  };
  expect((await request.get("/admin", { headers: forged })).status()).toBe(403);
  expect(
    (await request.post("/admin/status", { form: { slug: SLUG, status: "offer" }, headers: forged })).status(),
  ).toBe(403);
});

test.describe("scanner classification", () => {
  const visit = { userAgent: PHONE_UA, asn: 1759, secondsSincePublish: 86_400 };
  test("a person on a home or mobile network is not a scanner", () => {
    expect(classifyOpen(visit)).toEqual({ scanner: false });
  });
  test("known scanner agents, cloud networks and instant opens are", () => {
    expect(classifyOpen({ ...visit, userAgent: "Mozilla/5.0 (compatible; Proofpoint URL Defense)" })).toMatchObject({
      reason: "agent",
    });
    expect(classifyOpen({ ...visit, userAgent: null })).toMatchObject({ reason: "agent" });
    expect(classifyOpen({ ...visit, asn: 8075 })).toMatchObject({ reason: "network" });
    expect(classifyOpen({ ...visit, secondsSincePublish: 12 })).toMatchObject({ reason: "too-fast" });
  });
});

test("a status change moves an application through the funnel", () => {
  const row = (status: ApplicationRow["status"], human_opens = 0, cv_downloads = 0): ApplicationRow => ({
    slug: "x-abcde",
    company: "X",
    role: "Y",
    status,
    published_at: 1,
    human_opens,
    scanner_opens: 3,
    last_human: null,
    first_human: null,
    followed_up_at: null,
    fit_views: 0,
    cv_downloads,
    case_clicks: 0,
    elevator_uses: 0,
  });
  const counts = (rows: ApplicationRow[]) => funnel(rows).map((s) => s.count);
  expect(counts([row("applied")])).toEqual([1, 0, 0, 0, 0]);
  expect(counts([row("applied", 1, 1)])).toEqual([1, 1, 1, 0, 0]);
  expect(counts([row("interview", 1, 1)])).toEqual([1, 1, 1, 1, 0]);
  expect(counts([row("offer", 1, 1)])).toEqual([1, 1, 1, 1, 1]);
  expect(counts([row("withdrawn", 1, 1)])).toEqual([0, 0, 0, 0, 0]);
});

test.describe("Access token verification", () => {
  const config = { teamDomain: "team.cloudflareaccess.com", aud: "aud-123" };
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

  async function setup() {
    const keys = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    const jwk = { ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: "k1" };
    const sign = async (payload: object, kid = "k1") => {
      const head = enc({ alg: "RS256", kid });
      const body = enc(payload);
      const sig = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        keys.privateKey,
        new TextEncoder().encode(`${head}.${body}`),
      );
      return `${head}.${body}.${Buffer.from(sig).toString("base64url")}`;
    };
    return { sign, fetchKeys: async () => [jwk] };
  }
  const now = 1_800_000_000;
  const good = {
    aud: ["aud-123"],
    iss: "https://team.cloudflareaccess.com",
    exp: now + 600,
    email: "janrau@janrau.dev",
  };

  test("a valid token yields the email", async () => {
    const { sign, fetchKeys } = await setup();
    expect(await verifyAccess(await sign(good), config, fetchKeys, now)).toBe("janrau@janrau.dev");
  });

  test("wrong audience, issuer, expiry, key or signature yields nothing", async () => {
    const { sign, fetchKeys } = await setup();
    const other = await setup();
    for (const token of [
      await sign({ ...good, aud: ["someone-else"] }),
      await sign({ ...good, iss: "https://evil.cloudflareaccess.com" }),
      await sign({ ...good, exp: now - 1 }),
      await sign(good, "unknown-kid"),
      await other.sign(good),
    ])
      expect(await verifyAccess(token, config, fetchKeys, now)).toBeNull();
  });

  test("no configuration keeps admin closed", async () => {
    const { sign, fetchKeys } = await setup();
    expect(await verifyAccess(await sign(good), undefined, fetchKeys, now)).toBeNull();
  });
});

test.describe("engagement on a tailored link", () => {
  test.beforeEach(() => {
    sql(`DELETE FROM events WHERE slug = '${SLUG}'`);
    sql(`DELETE FROM comments WHERE slug = '${SLUG}'`);
  });

  const VISIT = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const beacon = (request: import("@playwright/test").APIRequestContext, body: object) =>
    request.post("/e", {
      data: JSON.stringify({ slug: SLUG, visit: VISIT, ...body }),
      headers: { "content-type": "text/plain", origin: ORIGIN, "user-agent": PHONE_UA },
    });

  test("a visit's events carry its id, what each was about, and only a coarse reader", async ({ request }) => {
    await beacon(request, { type: "human" });
    await beacon(request, { type: "case_click", case: "kiln" });
    await beacon(request, { type: "elevator", terms: ["kubernetes", "made-up"] });
    await beacon(request, { type: "visit_end", seconds: 95 });
    // Junk details are dropped; a visit_end without sane seconds isn't stored at all.
    await beacon(request, { type: "case_click", case: "../admin" });
    await beacon(request, { type: "visit_end", seconds: 999_999 });
    const rows = () =>
      sql<{ type: string; visit: string | null; detail: string | null; reader: string | null }>(
        `SELECT type, visit, detail, reader FROM events WHERE slug = '${SLUG}' ORDER BY id`,
      );
    await expect.poll(() => rows().length).toBe(5);
    const r = rows();
    expect(r.every((e) => e.visit === VISIT)).toBe(true);
    expect(r.map((e) => [e.type, e.detail])).toEqual([
      ["human", null],
      ["case_click", "kiln"],
      ["elevator", "kubernetes"],
      ["visit_end", "95"],
      ["case_click", null],
    ]);
    expect(r[0]?.reader).toMatch(/^phone:[0-9a-f]{8}$/);
    expect(r.slice(1).every((e) => e.reader === null)).toBe(true);
  });

  const comment = (request: import("@playwright/test").APIRequestContext, body: object) =>
    request.post("/c", { data: { slug: SLUG, ...body }, headers: { origin: ORIGIN } });
  const comments = () =>
    sql<{ message: string; contact: string | null }>(`SELECT message, contact FROM comments WHERE slug = '${SLUG}'`);

  test("a comment is stored and acknowledged; empty, honeypot and over-limit ones are not stored", async ({
    request,
  }) => {
    const ok = await comment(request, { message: "How big is the team?", contact: "r@acme.example" });
    expect(await ok.json()).toEqual({ ok: true, message: "Sent. Thank you: it went straight to my inbox." });
    expect(comments()).toEqual([{ message: "How big is the team?", contact: "r@acme.example" }]);

    const empty = await comment(request, { message: "  " });
    expect(empty.status()).toBe(400);
    expect((await empty.json()).message).toBe("Write a message first.");
    // The honeypot is told it worked, so a bot learns nothing, and nothing is stored.
    expect((await comment(request, { message: "buy now", website: "http://spam" })).status()).toBe(200);
    expect(comments()).toHaveLength(1);

    // A link takes 20 a day.
    sql(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 19)
       INSERT INTO comments (slug, ts, message) SELECT '${SLUG}', ${Math.floor(Date.now() / 1000)}, 'x' FROM n`,
    );
    const over = await comment(request, { message: "one more" });
    expect(over.status()).toBe(429);
    expect(comments()).toHaveLength(20);
  });

  test("without JavaScript, the form posts and comes back to the page with the result", async ({ request }) => {
    const res = await request.post("/c", {
      form: { slug: SLUG, message: "Posted without JavaScript", contact: "" },
      headers: { origin: ORIGIN },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(303);
    expect(res.headers().location).toMatch(new RegExp(`/for/${SLUG}\\?comment=sent#comment$`));
    expect(comments()).toEqual([{ message: "Posted without JavaScript", contact: null }]);
  });

  test("a staged link takes no comments", async ({ request }) => {
    const res = await request.post("/c", {
      data: { slug: "staged-co-st4gd", message: "Hello" },
      headers: { origin: ORIGIN },
    });
    expect(res.status()).toBe(429);
  });
});
