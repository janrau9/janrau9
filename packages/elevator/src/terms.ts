import type { IndexTerm } from "./types.ts";

/** A term found in the question. */
export interface TermHit {
  id: string;
  via: "alias" | "spelling" | "meaning";
  /** The words that matched, for the trace. */
  word: string;
  score?: number;
}

export interface TermMatch {
  /** Terms the question names. */
  found: TermHit[];
  /** Nothing named, but these are close: "Did you mean…?" */
  maybe: TermHit[];
}

/** A term embedding this close is the term; between MAYBE and SURE it is a suggestion. */
export const SURE = 0.7;
export const MAYBE = 0.6;

// Words that are never a tech term on their own, even when an alias spells them ("go", "lead").
const NOT_TERMS = new Set(
  "a an and any are about do does did experience for from have has how i in is it know me my of on or the to use used using what with work worked you your".split(
    " ",
  ),
);

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9+#./ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/** Share of letter triples two words have in common (Jaccard). Catches typos embeddings miss. */
export function similarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  let shared = 0;
  for (const x of A) if (B.has(x)) shared++;
  return shared / (A.size + B.size - shared);
}

export class TermMatcher {
  private readonly spellings = new Map<string, string>();

  constructor(readonly terms: IndexTerm[]) {
    for (const t of terms) for (const s of [t.id, t.label, ...t.aliases]) this.spellings.set(normalize(s), t.id);
  }

  /**
   * Three steps, cheapest first: an exact spelling (longest phrase wins), then a typo by
   * letter triples, then meaning, from the question's similarity to each term's embedding.
   * `meaning` is undefined when the model isn't loaded (keywords-only mode).
   */
  match(question: string, meaning?: ReadonlyMap<string, number>): TermMatch {
    const words = normalize(question).split(" ").filter(Boolean);
    const taken = new Set<number>();
    const found: TermHit[] = [];
    for (let n = 3; n >= 1; n--)
      for (let i = 0; i + n <= words.length; i++) {
        if (Array.from({ length: n }, (_, k) => i + k).some((k) => taken.has(k))) continue;
        let phrase = words.slice(i, i + n).join(" ");
        if (n === 1 && NOT_TERMS.has(phrase)) continue;
        if (!this.spellings.has(phrase) && phrase.endsWith("s")) phrase = phrase.slice(0, -1);
        const id = this.spellings.get(phrase);
        if (!id) continue;
        for (let k = 0; k < n; k++) taken.add(i + k);
        if (!found.some((f) => f.id === id)) found.push({ id, via: "alias", word: phrase });
      }
    if (found.length) return { found, maybe: [] };

    const spelled: TermHit[] = [];
    for (const word of words.filter((w) => w.length >= 4 && !NOT_TERMS.has(w))) {
      let best: TermHit | undefined;
      for (const [s, id] of this.spellings) {
        // Only compare words of similar length: "engineering" is not a typo of "platform engineering".
        // Typos are single words: "languages" is not a typo of "c language".
        if (s.length < 3 || s.includes(" ") || Math.min(s.length, word.length) / Math.max(s.length, word.length) < 0.75)
          continue;
        const score = similarity(word, s);
        if (score >= 0.45 && score < 1 && (!best || score > (best.score ?? 0)))
          best = { id, via: "spelling", word, score };
      }
      if (best && !spelled.some((h) => h.id === best.id)) spelled.push(best);
    }
    // A misspelling beats a guess by meaning: "kubernets" offers Kubernetes alone.
    if (spelled.length) return { found: [], maybe: spelled.slice(0, 2) };
    if (!meaning) return { found: [], maybe: [] };

    const ranked = [...meaning].sort((a, b) => b[1] - a[1]);
    const [top, second] = ranked;
    if (top && top[1] >= SURE && top[1] - (second?.[1] ?? 0) >= 0.03)
      return { found: [{ id: top[0], via: "meaning", word: question, score: top[1] }], maybe: [] };
    return {
      found: [],
      maybe: ranked
        .filter(([, s]) => s >= MAYBE)
        .slice(0, 2)
        .map(([id, score]) => ({ id, via: "meaning" as const, word: question, score })),
    };
  }
}
