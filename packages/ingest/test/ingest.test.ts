import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { detect } from "../src/detect.ts";
import { fetchPost, fromPaste } from "../src/ladder.ts";
import { type Fetcher, NeedsPaste } from "../src/types.ts";

// Fictional fixtures only: real posts in a public repo would reveal where Janrau applies.
const fixture = (name: string) => readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8");

/** A fetcher that serves fixtures by URL and records what was requested. */
function fakeWeb(routes: Record<string, { body: string; status?: number }>) {
  const requested: string[] = [];
  const fetcher: Fetcher = async (url) => {
    requested.push(url);
    const route = Object.entries(routes).find(([prefix]) => url.startsWith(prefix))?.[1];
    if (!route) return new Response("not found", { status: 404 });
    return new Response(route.body, { status: route.status ?? 200 });
  };
  return { fetcher, requested };
}

describe("detecting where a post lives", () => {
  test.each([
    ["https://job-boards.greenhouse.io/acme/jobs/123", { kind: "greenhouse", board: "acme", id: "123" }],
    ["https://boards.greenhouse.io/acme/jobs/123?gh_src=x", { kind: "greenhouse", board: "acme", id: "123" }],
    ["https://jobs.ashbyhq.com/acme/22222222-bbbb", { kind: "ashby", org: "acme", id: "22222222-bbbb" }],
    ["https://www.linkedin.com/jobs/view/123", { kind: "linkedin" }],
    ["https://careers.acme.example/jobs/1/123", { kind: "web", url: "https://careers.acme.example/jobs/1/123" }],
  ])("%s", (url, expected) => {
    expect(detect(url)).toEqual(expected);
  });
});

describe("the fetch ladder", () => {
  test("step 1: Greenhouse's API, with its double-escaped HTML turned into text", async () => {
    const { fetcher, requested } = fakeWeb({
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs/123": { body: fixture("greenhouse.json") },
    });
    const post = await fetchPost("https://job-boards.greenhouse.io/acme/jobs/123", { fetcher });
    expect(post).toMatchObject({
      company: "Acme Events",
      role: "Software Engineer",
      location: "Helsinki, Finland",
      source: { step: "ats", ats: "greenhouse" },
    });
    expect(post.text).toContain("- Experience with TypeScript and React");
    expect(post.text).not.toMatch(/&lt;|<p>/);
    expect(requested).toHaveLength(1);
  });

  test("step 1: Ashby's API, picking the job by id", async () => {
    const { fetcher } = fakeWeb({
      "https://api.ashbyhq.com/posting-api/job-board/acme": { body: fixture("ashby.json") },
    });
    const post = await fetchPost("https://jobs.ashbyhq.com/acme/22222222-bbbb", { fetcher });
    expect(post).toMatchObject({ role: "Product Engineer", source: { step: "ats", ats: "ashby" } });
  });

  test("step 2: embedded job data, with a remote/hybrid conflict flagged and the text kept", async () => {
    const { fetcher } = fakeWeb({ "https://careers.acme.example/": { body: fixture("jsonld.html") } });
    const post = await fetchPost("https://careers.acme.example/jobs/9", { fetcher });
    expect(post).toMatchObject({
      company: "Acme Events",
      role: "Backend Engineer",
      location: "Helsinki, FI",
      source: { step: "json-ld" },
    });
    expect(post.conflicts).toEqual([expect.stringMatching(/says remote.*hybrid/)]);
    expect(post.text).toContain("office presence twice a week");
  });

  test("step 2: embedded job data whose HTML is escaped twice (Teamtailor) still becomes text", async () => {
    const { fetcher } = fakeWeb({ "https://careers.acme.example/": { body: fixture("jsonld-escaped.html") } });
    const post = await fetchPost("https://careers.acme.example/jobs/7-devex", { fetcher });
    expect(post.source.step).toBe("json-ld");
    expect(post.text).not.toMatch(/<\/?(p|span|li)>|&lt;/);
    expect(post.text).toContain("- Experience with CI/CD systems");
  });

  test("step 3: a plain page's main text, without navigation or footer", async () => {
    const { fetcher } = fakeWeb({ "https://careers.acme.example/": { body: fixture("plain.html") } });
    const post = await fetchPost("https://careers.acme.example/frontend", { fetcher });
    expect(post.source.step).toBe("readable");
    expect(post.text).toContain("Comfortable with real-time sync");
    expect(post.text).not.toContain("Home Jobs About");
  });

  test("step 4: a page built by JavaScript goes to the browser when one is available", async () => {
    const { fetcher } = fakeWeb({ "https://careers.acme.example/": { body: fixture("spa-shell.html") } });
    const post = await fetchPost("https://careers.acme.example/spa", {
      fetcher,
      render: async () => fixture("plain.html"),
    });
    expect(post.source.step).toBe("headless");
  });

  test("step 5: an empty JavaScript shell with no browser asks for the text, saying why", async () => {
    const { fetcher } = fakeWeb({ "https://careers.acme.example/": { body: fixture("spa-shell.html") } });
    const err = await fetchPost("https://careers.acme.example/spa", { fetcher }).catch((e) => e);
    expect(err).toBeInstanceOf(NeedsPaste);
    expect(err.attempts.join(" | ")).toMatch(/none on the page.*probably built by JavaScript.*not available here/);
  });

  test("a challenge page is never fought: it asks for the text", async () => {
    const { fetcher } = fakeWeb({ "https://careers.acme.example/": { body: fixture("challenge.html"), status: 200 } });
    const err = await fetchPost("https://careers.acme.example/blocked", {
      fetcher,
      render: async () => fixture("challenge.html"),
    }).catch((e) => e);
    expect(err).toBeInstanceOf(NeedsPaste);
    expect(err.attempts.join(" ")).toMatch(/challenge page/);
  });

  test("a 403 is treated as a block, not retried", async () => {
    const { fetcher, requested } = fakeWeb({ "https://careers.acme.example/": { body: "denied", status: 403 } });
    const err = await fetchPost("https://careers.acme.example/x", { fetcher }).catch((e) => e);
    expect(err).toBeInstanceOf(NeedsPaste);
    expect(requested).toHaveLength(1);
  });

  test("LinkedIn is refused without a single request", async () => {
    const { fetcher, requested } = fakeWeb({});
    await expect(fetchPost("https://www.linkedin.com/jobs/view/1", { fetcher })).rejects.toThrow(
      /LinkedIn isn't fetched/,
    );
    expect(requested).toEqual([]);
  });

  test("a closed Ashby job falls through to the page instead of failing outright", async () => {
    const { fetcher } = fakeWeb({
      "https://api.ashbyhq.com/": { body: JSON.stringify({ jobs: [] }) },
      "https://jobs.ashbyhq.com/acme/": { body: fixture("jsonld.html") },
    });
    const post = await fetchPost("https://jobs.ashbyhq.com/acme/33333333-cccc", { fetcher });
    expect(post.source.step).toBe("json-ld");
  });
});

describe("pasted posts", () => {
  test("are tidied and kept whole", () => {
    const post = fromPaste(`Software Engineer\n\n\n${"word ".repeat(80)}`, { company: "Acme Events" });
    expect(post).toMatchObject({ company: "Acme Events", role: "Software Engineer", source: { step: "paste" } });
    expect(post.text).not.toMatch(/\n{3}/);
  });
  test("too short to quote from is refused", () => {
    expect(() => fromPaste("Engineer wanted")).toThrow(NeedsPaste);
  });
});
