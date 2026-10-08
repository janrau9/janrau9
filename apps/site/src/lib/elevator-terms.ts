import siteData from "../generated/site-data.json" with { type: "json" };
import type { Db } from "./tailored";

export interface GlossaryTerm {
  id: string;
  label: string;
  status: "have" | "adjacent" | "not-yet";
}

/** The glossary this Worker was built with: the only ids /q accepts. */
export const GLOSSARY = (siteData as unknown as { glossary: GlossaryTerm[] }).glossary;
const KNOWN = new Set(["none", ...GLOSSARY.map((t) => t.id)]);

/** Known term ids from an untrusted body, at most 3, no repeats. */
export function termIds(body: unknown): string[] {
  const terms = (body as { terms?: unknown } | null)?.terms;
  if (!Array.isArray(terms)) return [];
  return [...new Set(terms.filter((t): t is string => typeof t === "string" && KNOWN.has(t)))].slice(0, 3);
}

export const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

export async function recordTerms(db: Db, ids: string[], day = today()): Promise<void> {
  for (const id of ids)
    await db
      .prepare(
        "INSERT INTO elevator_terms (day, term, asks) VALUES (?, ?, 1) ON CONFLICT (day, term) DO UPDATE SET asks = asks + 1",
      )
      .bind(day, id)
      .run();
}

export interface AskedTerm extends GlossaryTerm {
  asks: number;
}

/** The most-asked terms since a day, with their status: what visitors look for, and what's missing. */
export async function askedTerms(db: Db | undefined, since: string): Promise<AskedTerm[]> {
  if (!db) return [];
  const { results } = await db
    .prepare(
      "SELECT term, SUM(asks) AS asks FROM elevator_terms WHERE day >= ? GROUP BY term ORDER BY asks DESC LIMIT 20",
    )
    .bind(since)
    .all<{ term: string; asks: number }>();
  const byId = new Map(GLOSSARY.map((t) => [t.id, t]));
  return results.map((r) => ({
    ...(byId.get(r.term) ?? {
      id: r.term,
      label: r.term === "none" ? "No term matched" : r.term,
      status: "not-yet" as const,
    }),
    asks: r.asks,
  }));
}
