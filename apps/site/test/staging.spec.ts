import { readFileSync } from "node:fs";
import { Variant } from "@janrau/schema/variant";
import { expect, test } from "@playwright/test";
import siteData from "../src/generated/site-data.json" with { type: "json" };
import { newSlug, postHash, publish, stage } from "../src/lib/staging";
import type { Db } from "../src/lib/tailored";

// Staging logic against an in-memory fake of D1 and KV.
const cv = (siteData as unknown as { cv: Parameters<typeof stage>[2] }).cv;
const variant = JSON.parse(readFileSync(new URL("fixtures/acme.variant.json", import.meta.url), "utf8"));
const post = readFileSync(new URL("fixtures/acme.post.txt", import.meta.url), "utf8");
const pdf = Buffer.from("%PDF-1.7 fake").toString("base64");
const input = () => ({ variant, post: { text: post }, pdfs: { page: pdf, cv: pdf, letter: pdf }, cvVersion: "test" });

function fakeStore() {
  const apps = new Map<string, Record<string, unknown>>();
  const variants = new Map<string, string>();
  const kv = new Map<string, unknown>();
  const db: Db = {
    prepare: (sql) => ({
      bind: (...v: unknown[]) => ({
        first: async <T>() => {
          if (sql.includes("WHERE post_hash"))
            return ([...apps.values()].find((a) => a.post_hash === v[0]) ?? null) as T;
          if (sql.includes("FROM applications WHERE slug")) return (apps.get(String(v[0])) ?? null) as T;
          return null;
        },
        run: async () => {
          if (sql.startsWith("INSERT INTO applications"))
            apps.set(String(v[0]), { slug: v[0], company: v[1], role: v[2], post_hash: v[4], published_at: null });
          else if (sql.startsWith("UPDATE applications SET company"))
            Object.assign(apps.get(String(v[3])) ?? {}, { company: v[0] });
          else if (sql.startsWith("UPDATE applications SET published_at")) {
            const a = apps.get(String(v[1]));
            if (a) a.published_at ??= v[0];
          } else if (sql.startsWith("INSERT INTO variants")) variants.set(String(v[0]), String(v[1]));
          return {};
        },
        all: async <T>() => ({ results: [] as T[] }),
      }),
    }),
  };
  return { db, kv: { put: async (k: string, val: unknown) => void kv.set(k, val) }, apps, variants, keys: kv };
}

test("the fixture variant is valid", () => {
  expect(Variant.safeParse(variant).success).toBe(true);
});

test("staging creates an unpublished application with its files", async () => {
  const s = fakeStore();
  const r = await stage(s.db, s.kv, cv, input());
  expect(r).toMatchObject({ ok: true, published: false, isNew: true });
  if (!r.ok) return;
  expect(r.slug).toMatch(/^acme-events-[0-9a-hjkmnp-tv-z]{5}$/);
  expect(s.apps.get(r.slug)?.published_at).toBeNull();
  expect([...s.keys.keys()].sort()).toEqual(
    [`cv:${r.slug}`, `cvfile:${r.slug}`, `letter:${r.slug}`, `post:${r.slug}`].sort(),
  );
});

test("staging the same post again keeps its link", async () => {
  const s = fakeStore();
  const a = await stage(s.db, s.kv, cv, input());
  const b = await stage(s.db, s.kv, cv, input());
  expect(a.ok && b.ok && a.slug === b.slug).toBe(true);
  expect(b).toMatchObject({ isNew: false });
});

test("the server re-validates: an invented ID is refused", async () => {
  const s = fakeStore();
  const bad = input();
  bad.variant = { ...variant, projectIds: ["proj.invented"] };
  const r = await stage(s.db, s.kv, cv, bad);
  expect(r).toMatchObject({ ok: false, status: 422 });
  expect(s.apps.size).toBe(0);
});

test("anything that isn't a PDF is refused", async () => {
  const s = fakeStore();
  const bad = input();
  bad.pdfs.letter = Buffer.from("<script>").toString("base64");
  expect(await stage(s.db, s.kv, cv, bad)).toMatchObject({ ok: false, status: 400 });
});

test("publishing is idempotent and keeps the first date", async () => {
  const s = fakeStore();
  const r = await stage(s.db, s.kv, cv, input());
  if (!r.ok) throw new Error("stage failed");
  await publish(s.db, r.slug, 100);
  await publish(s.db, r.slug, 200);
  expect(s.apps.get(r.slug)?.published_at).toBe(100);
  expect(await publish(s.db, "nobody-zzzzz")).toBe(false);
});

test("the post hash ignores whitespace and case, so a re-paste is the same post", async () => {
  expect(await postHash("Hello  World\n")).toBe(await postHash("hello world"));
});

test("slugs never use ambiguous characters", () => {
  for (let i = 0; i < 200; i++) expect(newSlug("Acme")).toMatch(/^acme-[0-9a-hjkmnp-tv-z]{5}$/);
});
