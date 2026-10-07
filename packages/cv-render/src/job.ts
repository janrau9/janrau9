/**
 * The application pipeline, runnable on the laptop or in a cloud Claude Code session.
 * State lives on janrau.dev (D1 and KV), not in local files, so any session can continue.
 *
 *   pnpm job fetch <url> <dir>                          read a post into <dir>/post.json
 *   pnpm job paste <file> <dir> --company X --role Y    the same, from pasted text
 *   pnpm job check <dir>                                validate <dir>/variant.json, render PDFs
 *   pnpm job stage <dir> [--local]                      send to the site, unpublished
 *   pnpm job publish <slug> [--local]                   make the link public
 *   pnpm job ping [--local]                             test credentials and network, change nothing
 *   pnpm job notify-test                                send one test notification email to Janrau
 *
 * Remote calls authenticate with a Cloudflare Access service token
 * (CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET). --local talks to `pnpm dev` instead.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { fetchPost, fromPaste, type JobPost, NeedsPaste } from "@janrau/ingest";
import { loadContent } from "@janrau/schema";
import { Variant, validateVariant } from "@janrau/schema/variant";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { buildTailoredDocument } from "./document.ts";
import { renderCoverLetter, renderPdf } from "./pdf.ts";

const SITE = "https://janrau.dev";

// Cloud sessions reach the internet through an HTTPS proxy given in HTTPS_PROXY. curl uses
// it; Node's fetch ignores it and connects directly, which the sandbox refuses with a bare
// 403. Route fetch (here and in @janrau/ingest) through the proxy whenever one is set.
if (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy)
  setGlobalDispatcher(new EnvHttpProxyAgent());
const root = resolve(import.meta.dirname, "../../..");
const cwd = process.env.INIT_CWD ?? process.cwd();
try {
  process.loadEnvFile(resolve(root, ".env"));
} catch {
  // Cloud sessions provide the same names as environment variables.
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { local: { type: "boolean", default: false }, company: { type: "string" }, role: { type: "string" } },
});
const [command, ...args] = positionals;
const local = values.local;
const base = local ? "http://localhost:4321" : (process.env.JANRAU_ADMIN_URL ?? SITE);

function fail(message: string, details: string[] = []): never {
  console.error(`\n✗ ${message}${details.map((d) => `\n  - ${d}`).join("")}\n`);
  process.exit(1);
}

const dirOf = (arg: string | undefined) => {
  if (!arg) fail("Give a folder for this application, e.g. private/drafts/acme");
  const dir = resolve(cwd, arg);
  mkdirSync(dir, { recursive: true });
  return dir;
};

async function render(post: JobPost, raw: unknown) {
  const content = loadContent(resolve(root, "content"));
  const issues = validateVariant(raw, content.cv, post.text, "variant.json");
  if (issues.length > 0)
    fail(
      "The variant failed validation:",
      issues.map((i) => `${i.path}: ${i.message}`),
    );
  const variant = Variant.parse(raw);
  const tailored = buildTailoredDocument(content, variant, { site: SITE, phone: process.env.CV_PHONE });
  const { coverNote: _note, ...cvOnly } = tailored;
  const c = tailored.contact;
  const pdfs = {
    page: renderPdf(tailored),
    cv: renderPdf(cvOnly),
    letter: renderCoverLetter({
      name: tailored.name,
      headline: tailored.headline,
      contact: [c.location, c.email, ...(c.phone ? [c.phone] : []), c.site],
      date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
      company: variant.company,
      role: variant.role,
      paragraphs: tailored.coverNote?.paragraphs ?? [],
      // The real link is known after staging; the letter is re-rendered then (see stage).
      closing: "",
    }),
  };
  return { variant, tailored, pdfs };
}

function letterClosing(slug: string) {
  return `I would be glad to talk. A page tailored to this role, with the evidence behind each point: ${SITE.replace("https://", "")}/for/${slug}`;
}

function summary(variant: Variant, post: JobPost) {
  const note = Object.values(variant.coverNote)
    .map((p) => p.text)
    .join(" ");
  console.log(`\n${variant.company} · ${variant.role}\n`);
  for (const row of variant.fit) console.log(`  “${row.requirement}”\n    → ${row.evidenceIds.join(", ")}`);
  console.log(`\n  projects: ${variant.projectIds.join(", ")}`);
  console.log(`  cover note: ${note.split(/\s+/).length} words`);
  for (const f of variant.formAnswers ?? [])
    console.log(`  form: ${f.question} · ${f.answer.length}${f.limit ? ` / ${f.limit}` : ""} characters`);
  console.log(`  gaps (private, never published): ${variant.gaps.join("; ") || "none"}`);
  for (const c of post.conflicts) console.log(`  ⚠ ${c}`);
}

/** Headers that authenticate the CLI to janrau.dev's /admin through Cloudflare Access. */
function authHeaders(): Record<string, string> {
  if (local) return {};
  const id = process.env.CF_ACCESS_CLIENT_ID?.trim();
  const secret = process.env.CF_ACCESS_CLIENT_SECRET?.trim();
  if (!id || !secret)
    fail(
      "CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are needed to reach janrau.dev (see docs/apply-anywhere.md).",
    );
  return { "CF-Access-Client-Id": id, "CF-Access-Client-Secret": secret };
}

/**
 * Say which layer answered a failed call. A bare "HTTP 403" hides whether Cloudflare
 * Access, Astro's request check, or the app itself refused, and those need different fixes.
 */
async function explain(res: Response): Promise<string[]> {
  const type = res.headers.get("content-type") ?? "";
  const text = await res.text().catch(() => "");
  const ray = res.headers.get("cf-ray");
  const lines = [`HTTP ${res.status}, ${type || "no content type"}${ray ? `, Cloudflare ray ${ray}` : ""}`];
  if (!ray) {
    lines.push(
      `No cf-ray header: this answer never came from Cloudflare. Something between here and janrau.dev refused it, most likely a network proxy or firewall${process.env.HTTPS_PROXY ? " (HTTPS_PROXY is set; requests are routed through it)" : ""}.`,
    );
    return lines;
  }
  if (/cloudflareaccess|Cloudflare Access|cf-access/i.test(text) || res.headers.get("cf-access-domain"))
    lines.push(
      "Answered by Cloudflare Access: it refused the service token. Check that CF_ACCESS_CLIENT_ID/SECRET match the token, that the token hasn't expired, and that the Portfolio admin app has a Service Auth policy including it. Zero Trust → Logs → Access shows the reason.",
    );
  else if (/cross-site/i.test(text))
    lines.push("Answered by Astro's cross-site request check, not by Access or the app.");
  else if (type.includes("application/json")) lines.push(`Answered by the app: ${text.slice(0, 300)}`);
  else lines.push(`Body starts: ${text.replace(/\s+/g, " ").slice(0, 200) || "(empty)"}`);
  return lines;
}

async function api(path: string, body?: unknown) {
  const headers: Record<string, string> = { accept: "application/json", ...authHeaders() };
  if (body !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "manual",
    });
  } catch (err) {
    const cause = (err as { cause?: { message?: string; code?: string } }).cause;
    fail(`Couldn't connect to ${base}.`, [
      cause?.message ?? (err as Error).message,
      process.env.HTTPS_PROXY
        ? "HTTPS_PROXY is set and requests go through it: the proxy refused or couldn't reach janrau.dev. Check the environment's network access."
        : "No proxy is set. Check the network connection.",
    ]);
  }
  if (res.status >= 300 && res.status < 400)
    fail("Cloudflare Access redirected to a login page: the request carried no accepted service token.", [
      `HTTP ${res.status} → ${res.headers.get("location")?.slice(0, 80) ?? "?"}`,
    ]);
  if (!res.ok) {
    const lines = await explain(res.clone());
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    fail(String(data.message ?? "The request was refused."), [...((data.issues as string[]) ?? []), ...lines]);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (data.ok !== true) fail(String(data.message ?? "Unexpected answer."), (data.issues as string[]) ?? []);
  return data;
}

const readJson = <T>(path: string, what: string): T => {
  if (!existsSync(path)) fail(`Missing ${what}: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as T;
};

switch (command) {
  case "fetch": {
    const url = args[0];
    const dir = dirOf(args[1]);
    if (!url) fail("Give the job post's URL.");
    let renderer: ((u: string) => Promise<string>) | undefined;
    try {
      const { chromium } = await import("@playwright/test");
      renderer = async (u) => {
        const browser = await chromium.launch();
        try {
          const page = await browser.newPage();
          await page.goto(u, { waitUntil: "domcontentloaded", timeout: 45_000 });
          await page.waitForTimeout(4000);
          return await page.content();
        } finally {
          await browser.close();
        }
      };
    } catch {
      // No browser here: the ladder stops before step 4 and asks for the text if needed.
    }
    try {
      const post = await fetchPost(url, renderer ? { render: renderer } : {});
      writeFileSync(resolve(dir, "post.json"), `${JSON.stringify(post, null, 2)}\n`);
      console.log(`\n✓ ${post.role} at ${post.company || "(company unknown: set it in variant.json)"}`);
      console.log(
        `  via ${post.source.step}${post.source.ats ? ` (${post.source.ats})` : ""}, ${post.text.length} characters`,
      );
      for (const c of post.conflicts) console.log(`  ⚠ ${c}`);
      console.log(`  saved ${resolve(dir, "post.json")}\n`);
    } catch (err) {
      if (err instanceof NeedsPaste) fail(err.message, err.attempts);
      throw err;
    }
    break;
  }
  case "paste": {
    const file = args[0];
    const dir = dirOf(args[1]);
    if (!file) fail("Give the file holding the pasted post.");
    const hint: { company?: string; role?: string } = {};
    if (values.company) hint.company = values.company;
    if (values.role) hint.role = values.role;
    const post = fromPaste(readFileSync(resolve(cwd, file), "utf8"), hint);
    writeFileSync(resolve(dir, "post.json"), `${JSON.stringify(post, null, 2)}\n`);
    console.log(`\n✓ saved ${resolve(dir, "post.json")} (${post.text.length} characters)\n`);
    break;
  }
  case "check": {
    const dir = dirOf(args[0]);
    const post = readJson<JobPost>(resolve(dir, "post.json"), "post.json");
    const { variant, pdfs } = await render(post, readJson(resolve(dir, "variant.json"), "variant.json"));
    const out = resolve(dir, "out");
    mkdirSync(out, { recursive: true });
    writeFileSync(resolve(out, "page-cv.pdf"), pdfs.page);
    writeFileSync(resolve(out, "cv.pdf"), pdfs.cv);
    summary(variant, post);
    console.log(`  PDFs for review: ${out}\n\n✓ Valid. Next: pnpm job stage ${args[0]}${local ? " --local" : ""}\n`);
    break;
  }
  case "stage": {
    const dir = dirOf(args[0]);
    const post = readJson<JobPost>(resolve(dir, "post.json"), "post.json");
    const raw = readJson<unknown>(resolve(dir, "variant.json"), "variant.json");
    const { variant, tailored, pdfs } = await render(post, raw);
    summary(variant, post);
    const cvVersion = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const b64 = (b: Buffer) => b.toString("base64");
    const body = (letter: Buffer) => ({
      variant: raw,
      post: { text: post.text, ...(post.source.url ? { url: post.source.url } : {}) },
      pdfs: { page: b64(pdfs.page), cv: b64(pdfs.cv), letter: b64(letter) },
      cvVersion,
    });
    // Stage once to learn the link (the same post always keeps its link), then again with
    // the letter that names it.
    const first = await api("/admin/api/stage", body(pdfs.letter));
    const slug = String(first.slug);
    const c = tailored.contact;
    const letter = renderCoverLetter({
      name: tailored.name,
      headline: tailored.headline,
      contact: [c.location, c.email, ...(c.phone ? [c.phone] : []), c.site],
      date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
      company: variant.company,
      role: variant.role,
      paragraphs: tailored.coverNote?.paragraphs ?? [],
      closing: letterClosing(slug),
    });
    const staged = await api("/admin/api/stage", body(letter));
    console.log(
      `\n✓ Staged${staged.published ? " (already public: the live page now shows this version)" : ", not public yet"}.`,
    );
    console.log(`  Review and download attachments: ${String(staged.reviewUrl)}`);
    console.log(`  Publish from that page, or: pnpm job publish ${slug}${local ? " --local" : ""}\n`);
    break;
  }
  case "ping": {
    // The same code path as stage and publish, with nothing to change: tests credentials and network.
    const who = await api("/admin/api/whoami");
    console.log(`\n✓ Reached ${base} as ${String(who.identity)}\n`);
    break;
  }
  case "notify-test": {
    const sent = await api("/admin/api/notify-test", {});
    console.log(`\n✓ Sent (message ${String(sent.messageId)}). Check the inbox, and the spam folder the first time.\n`);
    break;
  }
  case "publish": {
    const slug = args[0];
    if (!slug) fail("Give the application's slug, e.g. acme-events-k7f3q");
    const done = await api("/admin/api/publish", { slug });
    console.log(`\n✓ Live: ${String(done.publicUrl)}\n`);
    break;
  }
  default:
    fail(
      "Commands: fetch, paste, check, stage, publish, ping, notify-test. See the top of packages/cv-render/src/job.ts.",
    );
}
