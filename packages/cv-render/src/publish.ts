/**
 * Publish a hand-written variant as a tailored link.
 *
 *   pnpm publish-variant private/variants/acme.json            review only (writes the PDF locally)
 *   pnpm publish-variant private/variants/acme.json --yes      publish to production D1 and KV
 *   pnpm publish-variant private/variants/acme.json --local    publish to the local D1 and KV
 *
 * Next to acme.json: acme.post.txt (the job post, required: quotes are checked against
 * it) and acme.slug (created on first publish; keeps the link stable on republish).
 */
import { execFileSync } from "node:child_process";
import { createHash, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { loadContent } from "@janrau/schema";
import { Variant, validateVariant } from "@janrau/schema/variant";
import { buildTailoredDocument } from "./document.ts";
import { renderPdf } from "./pdf.ts";

const SITE = "https://janrau.dev";
const root = resolve(import.meta.dirname, "../../..");
const siteDir = resolve(root, "apps/site");
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const mode = args.includes("--yes") ? "remote" : args.includes("--local") ? "local" : "review";
if (!file) {
  console.error("usage: publish-variant <variant.json> [--yes | --local]");
  process.exit(2);
}

// INIT_CWD: where the command was typed, so relative paths work from the repo root.
const variantPath = resolve(process.env.INIT_CWD ?? process.cwd(), file);
const base = variantPath.replace(/\.json$/, "");
const postPath = `${base}.post.txt`;
const slugPath = `${base}.slug`;
if (!existsSync(postPath)) fail(`missing ${basename(postPath)}: the job post is needed to check quotes`);

try {
  process.loadEnvFile(resolve(root, ".env"));
} catch {
  console.warn("no .env: the PDF will have no phone number");
}

const content = loadContent(resolve(root, "content"));
const raw = JSON.parse(readFileSync(variantPath, "utf8"));
const post = readFileSync(postPath, "utf8");
const issues = validateVariant(raw, content.cv, post, basename(variantPath));
if (issues.length > 0) fail(issues.map((i) => `${i.path}: ${i.message}`).join("\n"));
const variant = Variant.parse(raw);

const slug = existsSync(slugPath) ? readFileSync(slugPath, "utf8").trim() : newSlug(variant.company);
const pdf = renderPdf(buildTailoredDocument(content, variant, { site: SITE, phone: process.env.CV_PHONE }));
const outDir = resolve(dirname(variantPath), "out");
mkdirSync(outDir, { recursive: true });
const pdfPath = resolve(outDir, `${slug}.pdf`);
writeFileSync(pdfPath, pdf);

// The review: what the page will claim, and what it deliberately leaves out.
const note = Object.values(variant.coverNote)
  .map((p) => p.text)
  .join(" ");
console.log(`\n${variant.company} · ${variant.role}\n`);
for (const row of variant.fit) console.log(`  “${row.requirement}”\n    → ${row.evidenceIds.join(", ")}`);
console.log(`\n  projects: ${variant.projectIds.join(", ")}`);
console.log(`  cover note: ${note.split(/\s+/).length} words`);
console.log(`  gaps (private, never published): ${variant.gaps.join("; ") || "none"}`);
console.log(`  PDF for review: ${pdfPath}\n`);

if (mode === "review") {
  console.log("Review only. Run again with --yes to publish.");
  process.exit(0);
}

const hash = createHash("sha256").update(post.replace(/\s+/g, " ").trim().toLowerCase()).digest("hex");
const cvVersion = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const now = Math.floor(Date.now() / 1000);
const q = (s: string | undefined) => (s === undefined ? "NULL" : `'${s.replaceAll("'", "''")}'`);
const sql = `
INSERT INTO applications (slug, company, role, source_url, post_hash, status, created_at, published_at)
VALUES (${q(slug)}, ${q(variant.company)}, ${q(variant.role)}, ${q(variant.sourceUrl)}, ${q(hash)}, 'draft', ${now}, ${now})
ON CONFLICT (slug) DO UPDATE SET company = excluded.company, role = excluded.role,
  source_url = excluded.source_url, post_hash = excluded.post_hash, published_at = excluded.published_at;
INSERT INTO variants (slug, variant_json, cv_version) VALUES (${q(slug)}, ${q(JSON.stringify(variant))}, ${q(cvVersion)})
ON CONFLICT (slug) DO UPDATE SET variant_json = excluded.variant_json, cv_version = excluded.cv_version;
`;
const sqlPath = resolve(outDir, `${slug}.sql`);
writeFileSync(sqlPath, sql);

const flag = mode === "remote" ? "--remote" : "--local";
const wrangler = (...a: string[]) =>
  execFileSync("pnpm", ["exec", "wrangler", ...a, flag], { cwd: siteDir, stdio: "inherit" });
try {
  wrangler("d1", "execute", "janrau-dev", "--file", sqlPath, "--yes");
} catch {
  fail(
    "D1 rejected the insert. If the job post was already published under another link, this is the duplicate check (post_hash is unique).",
  );
}
wrangler("kv", "key", "put", `cv:${slug}`, "--path", pdfPath, "--binding", "CV_FILES");
wrangler("kv", "key", "put", `post:${slug}`, "--path", postPath, "--binding", "CV_FILES");
writeFileSync(slugPath, `${slug}\n`);

console.log(`\nPublished (${mode}): ${mode === "remote" ? SITE : "http://localhost:4321"}/for/${slug}`);

function newSlug(company: string): string {
  const name = company
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  // Crockford base32 without i, l, o, u: unambiguous when read aloud or retyped.
  const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
  const suffix = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `${name.slice(0, 40)}-${suffix}`;
}

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}
