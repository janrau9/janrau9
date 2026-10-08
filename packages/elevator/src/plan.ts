import { type Hit, Ranker, termEvidence } from "./rank.ts";
import { type TermHit, TermMatcher } from "./terms.ts";
import type { ElevatorIndex, IndexTerm, Passage } from "./types.ts";

/**
 * Generative UI without generated words: the model only ranks, and these rules turn what
 * it found into a layout. Every sentence a block shows is quoted from my own content,
 * except the fixed phrases below.
 */
export type Block =
  | { kind: "missing"; term: string; near: string[] }
  | { kind: "adjacent"; term: string; near: string[] }
  | { kind: "covers"; term: string; parts: string[] }
  | { kind: "did-you-mean"; options: string[]; footnote: boolean }
  | { kind: "nothing"; words: string[] }
  | { kind: "examples" }
  | { kind: "card"; project: Passage; quotes: Hit[] }
  | { kind: "timeline"; hits: Hit[] }
  | { kind: "decisions"; hits: Hit[] }
  | { kind: "quotes"; label: string; groups: { source: string; link?: string; hits: Hit[] }[] }
  | { kind: "more"; hits: Hit[] }
  | { kind: "listed"; names: string[] };

export interface Plan {
  blocks: Block[];
  /** Which rules fired, for the trace. */
  rule: string;
  /** What the glossary step found, for the trace. */
  termsNote: string;
  /** Matched term ids, the only thing about a question that is ever counted. */
  termIds: string[];
}

/** The best 3 lead; the rest wait behind "See more". */
export const LEAD = 3;
/** A passage this close means the question is answered even if a term was only "maybe". */
const STRONG = 0.62;

export class Planner {
  readonly matcher: TermMatcher;
  readonly ranker: Ranker;
  private readonly terms: Map<string, IndexTerm>;
  private readonly byId: Map<string, Passage>;

  constructor(index: Pick<ElevatorIndex, "passages" | "terms">) {
    this.matcher = new TermMatcher(index.terms);
    this.ranker = new Ranker(index.passages);
    this.terms = new Map(index.terms.map((t) => [t.id, t]));
    this.byId = new Map(index.passages.map((p) => [p.id, p]));
  }

  private label = (id: string) => this.terms.get(id)?.label ?? id;

  plan(
    question: string,
    scores?: { passages: ReadonlyMap<string, number>; terms: ReadonlyMap<string, number> },
    fit: ReadonlySet<string> = new Set(),
  ): Plan {
    const { found, maybe } = this.matcher.match(question, scores?.terms);
    const { reasons, listed } = termEvidence(found, this.terms);
    const hits = this.ranker.rank(question, scores?.passages, reasons, fit);
    const blocks: Block[] = [];
    const rules: string[] = [];
    const termsNote = describe(found, maybe, this.terms);
    const done = (): Plan => ({ blocks, rule: rules.join(" + "), termsNote, termIds: found.map((f) => f.id) });

    for (const hit of found) {
      const t = this.terms.get(hit.id);
      if (!t || t.status === "have") continue;
      rules.push(`${t.status} term`);
      blocks.push({
        kind: t.status === "adjacent" ? "adjacent" : "missing",
        term: t.label,
        near: t.near.map(this.label),
      });
    }
    for (const hit of found) {
      const t = this.terms.get(hit.id);
      if (!t?.related.length) continue;
      rules.push("broad term");
      blocks.push({ kind: "covers", term: t.label, parts: t.related.map(this.label) });
    }
    const strong = (hits[0]?.meaning ?? 0) >= STRONG;
    if (!found.length && maybe.length && !strong) {
      rules.push("did you mean");
      blocks.push({ kind: "did-you-mean", options: maybe.map((m) => this.label(m.id)), footnote: false });
      return done();
    }
    if (!hits.length) {
      // A term whose evidence is only a CV line (a role, a language) still has an answer.
      if (listed.length) {
        rules.push("listed only");
        blocks.push({ kind: "listed", names: listed });
        return done();
      }
      const words = found.length ? [] : this.ranker.unknownWords(question);
      if (words.length) blocks.push({ kind: "nothing", words });
      rules.push("empty state");
      blocks.push({ kind: "examples" });
      return done();
    }

    // A project card only when that project holds the best match and most of the top five.
    const used = new Set<string>();
    const projectOf = (p: Passage) => (p.kind === "project" ? p.id : p.project);
    const counts = new Map<string, number>();
    for (const h of hits.slice(0, 5)) {
      const p = projectOf(h.passage);
      if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    const [focus, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
    const top = hits[0];
    const project = focus ? this.byId.get(focus) : undefined;
    if (focus && project && n !== undefined && n >= 3 && top && projectOf(top.passage) === focus) {
      const quotes = hits.filter((h) => projectOf(h.passage) === focus && h.passage.kind !== "project");
      for (const h of quotes) used.add(h.passage.id);
      used.add(focus);
      rules.push(`project card (${project.source})`);
      blocks.push({ kind: "card", project, quotes });
    }

    const lead = hits.slice(0, LEAD).filter((h) => !used.has(h.passage.id));
    const more = hits.slice(LEAD).filter((h) => !used.has(h.passage.id));
    const ordered: [number, Block][] = [];
    const jobs = lead.filter((h) => h.passage.kind === "experience");
    const decisions = lead.filter((h) => h.passage.kind === "decision");
    const others = lead.filter((h) => h.passage.kind !== "experience" && h.passage.kind !== "decision");
    if (jobs[0]) {
      rules.push("timeline");
      ordered.push([jobs[0].score, { kind: "timeline", hits: jobs }]);
    }
    if (decisions[0]) {
      rules.push("decisions");
      ordered.push([decisions[0].score, { kind: "decisions", hits: decisions }]);
    }
    if (others[0]) {
      rules.push("quotes by source");
      const groups = new Map<string, { source: string; link?: string; hits: Hit[] }>();
      for (const h of others) {
        const key = h.passage.source;
        const g = groups.get(key) ?? { source: key, ...(h.passage.link ? { link: h.passage.link } : {}), hits: [] };
        g.hits.push(h);
        groups.set(key, g);
      }
      ordered.push([
        others[0].score,
        { kind: "quotes", label: used.size ? "Also" : "From my work", groups: [...groups.values()] },
      ]);
    }
    for (const [, b] of ordered.sort((a, b) => b[0] - a[0])) blocks.push(b);
    if (more.length) {
      rules.push(`see more (${more.length})`);
      blocks.push({ kind: "more", hits: more });
    }
    if (!found.length && maybe.length) {
      rules.push("did you mean (footnote)");
      blocks.push({ kind: "did-you-mean", options: maybe.map((m) => this.label(m.id)), footnote: true });
    }
    if (listed.length) {
      rules.push("listed skills");
      blocks.push({ kind: "listed", names: listed });
    }
    return done();
  }
}

function describe(found: TermHit[], maybe: TermHit[], terms: ReadonlyMap<string, IndexTerm>): string {
  const label = (id: string) => terms.get(id)?.label ?? id;
  if (found.length)
    return found.map((f) => `“${f.word}” → ${label(f.id)} (${f.via}, ${terms.get(f.id)?.status})`).join("; ");
  if (maybe.length) return `no term named; close: ${maybe.map((m) => `${label(m.id)} (${m.via})`).join(", ")}`;
  return "no term named";
}
