import type { Cv } from "@janrau/schema/cv";
import { resolveVariant, type TailoredView, type WorkRef } from "@janrau/schema/tailor";
import { Variant } from "@janrau/schema/variant";
import siteData from "../generated/site-data.json" with { type: "json" };

const data = siteData as unknown as { cv: Cv; work: WorkRef[] };

/** Slugs look like `acme-k7f3q`; anything else is not worth a database query. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*-[a-z0-9]{5}$/;

export type Lookup =
  | { kind: "found"; slug: string; view: TailoredView }
  | { kind: "missing" }
  | { kind: "unavailable"; reason: string };

/** Minimal D1 surface, so tests can pass a fake database. */
export interface Db {
  prepare(sql: string): { bind(...values: unknown[]): { first<T>(): Promise<T | null> } };
}

/**
 * Find a tailored application. "missing" means no such link (404); "unavailable"
 * means the link may exist but can't be served right now, so the visitor gets the
 * general page instead of an error.
 */
export async function lookup(db: Db | undefined, slug: string): Promise<Lookup> {
  if (!SLUG.test(slug)) return { kind: "missing" };
  if (!db) return { kind: "unavailable", reason: "no database binding" };
  let row: { variant_json: string } | null;
  try {
    row = await db
      .prepare(
        "SELECT v.variant_json FROM variants v JOIN applications a ON a.slug = v.slug WHERE v.slug = ? AND a.status != 'withdrawn'",
      )
      .bind(slug)
      .first<{ variant_json: string }>();
  } catch (err) {
    return { kind: "unavailable", reason: `database: ${(err as Error).message}` };
  }
  if (!row) return { kind: "missing" };
  const parsed = Variant.safeParse(safeJson(row.variant_json));
  if (!parsed.success) return { kind: "unavailable", reason: "stored variant is invalid" };
  return { kind: "found", slug, view: resolveVariant(data.cv, data.work, parsed.data) };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
