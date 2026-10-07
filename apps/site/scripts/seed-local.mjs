// Seed the LOCAL D1 and KV (never remote) with the fictional Acme fixture, for tests.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

export const FIXTURE_SLUG = "acme-events-t3st1";
const wrangler = (...args) =>
  execFileSync("pnpm", ["exec", "wrangler", ...args, "--local"], { stdio: ["ignore", "ignore", "inherit"] });

const variant = readFileSync(new URL("../test/fixtures/acme.variant.json", import.meta.url), "utf8");
const post = readFileSync(new URL("../test/fixtures/acme.post.txt", import.meta.url), "utf8");
const hash = createHash("sha256").update(post.replace(/\s+/g, " ").trim().toLowerCase()).digest("hex");
const q = (s) => `'${s.replaceAll("'", "''")}'`;
const sql = `
DELETE FROM applications WHERE slug = ${q(FIXTURE_SLUG)};
INSERT INTO applications (slug, company, role, post_hash, status, created_at, published_at)
  VALUES (${q(FIXTURE_SLUG)}, 'Acme Events', 'Software Engineer', ${q(hash)}, 'applied', 0, 0);
INSERT INTO variants (slug, variant_json, cv_version) VALUES (${q(FIXTURE_SLUG)}, ${q(JSON.stringify(JSON.parse(variant)))}, 'test');
DELETE FROM applications WHERE slug = 'event-test-ev3nt';
INSERT INTO applications (slug, company, role, post_hash, status, created_at, published_at)
  VALUES ('event-test-ev3nt', 'Event Test', 'Engineer', 'h3', 'applied', 0, 0);
INSERT INTO variants (slug, variant_json, cv_version) VALUES ('event-test-ev3nt', ${q(JSON.stringify(JSON.parse(variant)))}, 'test');
DELETE FROM applications WHERE slug = 'staged-co-st4gd';
INSERT INTO applications (slug, company, role, post_hash, status, created_at, published_at)
  VALUES ('staged-co-st4gd', 'Staged Co', 'Engineer', 'h4', 'draft', 0, NULL);
INSERT INTO variants (slug, variant_json, cv_version) VALUES ('staged-co-st4gd', ${q(JSON.stringify(JSON.parse(variant)))}, 'test');
INSERT INTO applications (slug, company, role, post_hash, status, created_at) VALUES ('withdrawn-co-wthdr', 'Withdrawn Co', 'X', 'h2', 'withdrawn', 0)
  ON CONFLICT DO NOTHING;
INSERT INTO variants (slug, variant_json, cv_version) VALUES ('withdrawn-co-wthdr', ${q(JSON.stringify(JSON.parse(variant)))}, 'test')
  ON CONFLICT DO NOTHING;
`;
const sqlFile = new URL("../.wrangler/seed.sql", import.meta.url).pathname;
writeFileSync(sqlFile, sql);
wrangler("d1", "migrations", "apply", "janrau-dev");
wrangler("d1", "execute", "janrau-dev", "--file", sqlFile);
wrangler(
  "kv",
  "key",
  "put",
  `cv:${FIXTURE_SLUG}`,
  "--path",
  "dist/client/janrau-beray-cv.pdf",
  "--binding",
  "CV_FILES",
);
// Notifications need a destination. The preview Worker reads its vars from beside the built
// config; there the send_email binding is simulated (logged, never sent), so a placeholder will do.
writeFileSync(new URL("../dist/server/.dev.vars", import.meta.url), "NOTIFY_TO=notify-test@example.invalid\n");
console.log(`seeded local D1 and KV with /for/${FIXTURE_SLUG}`);
