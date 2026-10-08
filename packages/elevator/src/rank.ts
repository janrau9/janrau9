import type { TermHit } from "./terms.ts";
import type { IndexTerm, Passage } from "./types.ts";

export interface Hit {
  passage: Passage;
  score: number;
  /** Shown under the quote: why it is here. */
  reasons: string[];
  /** Embedding similarity alone, before bonuses. */
  meaning: number;
}

/** Below this, a passage is not shown for meaning alone. Raised when a named term brings evidence. */
export const MEANING_FLOOR = 0.55;
export const MEANING_FLOOR_WITH_TERMS = 0.65;
const TERM_BONUS = 0.3;
const FIT_BONUS = 0.15;
const KEYWORD_BONUS = 0.1;

const STOP = new Set(
  "have has you your with what how does did the and for work worked built build any about done using use between experience janrau ever been there that this from into tell show people team things projects project apps app".split(
    " ",
  ),
);

/** Question words worth matching literally: 4+ letters, not filler. */
export const keywordsOf = (q: string) =>
  q
    .toLowerCase()
    .split(/[^a-z0-9+#.-]+/)
    .filter((t) => t.length >= 4 && !STOP.has(t));

/** A light stemmer: "testing", "tests" and "tested" all become "test". */
export const stem = (w: string) => {
  const cut = w.replace(/(ing|ions?|ers?|ed|es|s)$/, "");
  return cut.length >= 4 ? cut : w;
};

const wordsOf = (p: Passage) =>
  [p.text, p.source, p.heading ?? "", ...(p.keywords ?? []), ...(p.stack ?? [])]
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    // A sentence's full stop is not part of its last word ("tests." is "tests"); "next.js" keeps its dot.
    .map((w) => w.replace(/^\.+|\.+$/g, ""));

/** The evidence named terms bring, with the reason each passage is shown. */
export function termEvidence(found: TermHit[], terms: ReadonlyMap<string, IndexTerm>) {
  const reasons = new Map<string, string>();
  const listed: string[] = [];
  const add = (ids: string[], why: string) => {
    for (const id of ids) if (!reasons.has(id)) reasons.set(id, why);
  };
  for (const hit of found) {
    const t = terms.get(hit.id);
    if (!t) continue;
    add(t.evidence, t.status === "have" ? `by skill: ${t.label}` : `closest to ${t.label}`);
    for (const name of t.listed) if (!listed.includes(name)) listed.push(name);
    for (const r of t.related) {
      const part = terms.get(r);
      if (part) add(part.evidence.slice(0, 1), `by skill: ${part.label}`);
    }
  }
  return { reasons, listed };
}

export class Ranker {
  private readonly words: Map<string, string[]>;

  constructor(readonly passages: Passage[]) {
    this.words = new Map(passages.map((p) => [p.id, wordsOf(p)]));
  }

  /** Keywords match at word starts only, so "food" never hits "dogfooding", and "block" isn't "blockchain". */
  mentions(p: Passage, keyword: string): boolean {
    const s = stem(keyword);
    return (this.words.get(p.id) ?? []).some((w) => w.startsWith(s) && stem(w).length <= s.length + 1);
  }

  /** Question words no passage mentions: what "Nothing in my work mentions …" names. */
  unknownWords(q: string): string[] {
    return keywordsOf(q).filter((k) => !this.passages.some((p) => this.mentions(p, k)));
  }

  /**
   * Meaning, fused with keyword hits, term evidence and, on a tailored link, the fit table.
   * `meaning` is undefined in keywords-only mode.
   */
  rank(
    q: string,
    meaning: ReadonlyMap<string, number> | undefined,
    evidence: ReadonlyMap<string, string>,
    fit: ReadonlySet<string> = new Set(),
    limit = 9,
  ): Hit[] {
    const keywords = keywordsOf(q);
    const floor = evidence.size ? MEANING_FLOOR_WITH_TERMS : MEANING_FLOOR;
    const hits: Hit[] = [];
    for (const p of this.passages) {
      const m = meaning?.get(p.id) ?? 0;
      const kw = keywords.filter((k) => this.mentions(p, k)).length;
      const term = evidence.get(p.id);
      const byMeaning = meaning !== undefined && m >= floor;
      // With a named term, keywords alone don't qualify a passage: the term's evidence does.
      const byKeyword = kw > 0 && !evidence.size;
      if (!byMeaning && !term && !byKeyword) continue;
      const reasons = [
        term,
        byMeaning && "by meaning",
        kw > 0 && !term && "by keyword",
        fit.has(p.id) && "in this application",
      ];
      hits.push({
        passage: p,
        meaning: m,
        score: m + KEYWORD_BONUS * Math.min(kw, 2) + (term ? TERM_BONUS : 0) + (fit.has(p.id) ? FIT_BONUS : 0),
        reasons: reasons.filter((r): r is string => typeof r === "string"),
      });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
