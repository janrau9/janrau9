import type { Cv } from "@janrau/schema/cv";
import { validateVariant } from "@janrau/schema/variant";
import type { Db } from "./tailored";

/**
 * Staging: the CLI (laptop or cloud session) sends a validated variant, its job post and
 * its PDFs. The Worker validates again, against the CV it was built with, and stores
 * everything unpublished. Publishing is a separate, deliberate step.
 */
export interface StageInput {
  variant: unknown;
  post: { text: string; url?: string };
  /** Base64 PDFs: the page's CV (with cover note), the CV attachment, the cover letter. */
  pdfs: { page: string; cv: string; letter: string };
  /** The git commit of cv.yaml the variant was drafted against. */
  cvVersion: string;
}

export interface Kv {
  put(key: string, value: string | ArrayBuffer | Uint8Array): Promise<void>;
}

export type StageResult =
  | { ok: true; slug: string; published: boolean; isNew: boolean }
  | { ok: false; status: number; message: string; issues?: string[] };

const MAX_PDF_BYTES = 2_000_000;

export function postHash(text: string): Promise<string> {
  const normal = text.replace(/\s+/g, " ").trim().toLowerCase();
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(normal))
    .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""));
}

/** `acme-events-k7f3q`: readable company part, 5 unambiguous random characters (Crockford base32). */
export function newSlug(company: string): string {
  const name = company
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return `${name || "application"}-${[...bytes].map((b) => alphabet[b % 32]).join("")}`;
}

function decodePdf(b64: unknown): Uint8Array | undefined {
  if (typeof b64 !== "string" || b64.length > (MAX_PDF_BYTES * 4) / 3) return undefined;
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-" ? bytes : undefined;
  } catch {
    return undefined;
  }
}

export async function stage(
  db: Db,
  kv: Kv,
  cv: Cv,
  input: StageInput,
  now = Math.floor(Date.now() / 1000),
): Promise<StageResult> {
  const text = input.post?.text;
  if (typeof text !== "string" || text.length < 300)
    return { ok: false, status: 400, message: "The job post text is missing or too short." };
  const issues = validateVariant(input.variant, cv, text, "variant");
  if (issues.length > 0)
    return {
      ok: false,
      status: 422,
      message: "The variant failed validation.",
      issues: issues.map((i) => `${i.path}: ${i.message}`),
    };
  const variant = input.variant as { company: string; role: string; sourceUrl?: string };

  const pdfs = {
    page: decodePdf(input.pdfs?.page),
    cv: decodePdf(input.pdfs?.cv),
    letter: decodePdf(input.pdfs?.letter),
  };
  if (!pdfs.page || !pdfs.cv || !pdfs.letter)
    return { ok: false, status: 400, message: "Each of the 3 PDFs must be a PDF under 2 MB, in base64." };

  // The same post staged again keeps its link: the hash finds the existing application.
  const hash = await postHash(text);
  const existing = await db
    .prepare("SELECT slug, published_at FROM applications WHERE post_hash = ?")
    .bind(hash)
    .first<{ slug: string; published_at: number | null }>();
  const slug = existing?.slug ?? newSlug(variant.company);
  const sourceUrl = variant.sourceUrl ?? input.post.url ?? null;

  if (existing)
    await db
      .prepare("UPDATE applications SET company = ?, role = ?, source_url = ? WHERE slug = ?")
      .bind(variant.company, variant.role, sourceUrl, slug)
      .run();
  else
    await db
      .prepare(
        "INSERT INTO applications (slug, company, role, source_url, post_hash, status, created_at, published_at) VALUES (?, ?, ?, ?, ?, 'draft', ?, NULL)",
      )
      .bind(slug, variant.company, variant.role, sourceUrl, hash, now)
      .run();
  await db
    .prepare(
      "INSERT INTO variants (slug, variant_json, cv_version) VALUES (?, ?, ?) ON CONFLICT (slug) DO UPDATE SET variant_json = excluded.variant_json, cv_version = excluded.cv_version",
    )
    .bind(slug, JSON.stringify(input.variant), input.cvVersion)
    .run();

  await Promise.all([
    kv.put(`cv:${slug}`, pdfs.page),
    kv.put(`cvfile:${slug}`, pdfs.cv),
    kv.put(`letter:${slug}`, pdfs.letter),
    kv.put(`post:${slug}`, text),
  ]);
  return { ok: true, slug, published: existing?.published_at != null, isNew: !existing };
}

/** Make a staged application's link public. Idempotent: publishing twice keeps the first date. */
export async function publish(db: Db, slug: string, now = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const row = await db.prepare("SELECT slug FROM applications WHERE slug = ?").bind(slug).first<{ slug: string }>();
  if (!row) return false;
  await db
    .prepare("UPDATE applications SET published_at = COALESCE(published_at, ?) WHERE slug = ?")
    .bind(now, slug)
    .run();
  return true;
}

/**
 * Take a link offline again: the public page answers "not found" until it is published
 * again, at the same address. Status and tracking history are untouched.
 */
export async function unpublish(db: Db, slug: string): Promise<boolean> {
  const row = await db.prepare("SELECT slug FROM applications WHERE slug = ?").bind(slug).first<{ slug: string }>();
  if (!row) return false;
  await db.prepare("UPDATE applications SET published_at = NULL WHERE slug = ?").bind(slug).run();
  return true;
}
