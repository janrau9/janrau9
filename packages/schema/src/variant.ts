import { z } from "zod";
import type { Cv } from "./cv.ts";
import type { Issue } from "./validate.ts";

/**
 * A tailored application: which existing items to show for one job, in which order.
 * It selects and orders; it never adds claims. Every claim about me points at an ID
 * in cv.yaml, and every claim about the company is quoted from the job post.
 */
export const FIT_ROWS_MAX = 6;
export const PROJECTS_MAX = 3;
export const COVER_NOTE_WORDS_MAX = 180;

/** Phrases that make a cover note sound generic. A hit fails validation. */
export const BANNED_PHRASES = [
  "passionate",
  "i am excited to apply",
  "fast-paced",
  "team player",
  "go-getter",
  "synergy",
  "results-driven",
  "dynamic environment",
  "hit the ground running",
  "rockstar",
];

/** A paragraph about the company: grounded in quotes from the post. */
const PostParagraph = z.strictObject({ text: z.string().min(20), postQuotes: z.array(z.string().min(3)).min(1) });
/** A paragraph about me: grounded in cv.yaml items. */
const EvidenceParagraph = z.strictObject({ text: z.string().min(20), evidenceIds: z.array(z.string()).min(1) });

export const Variant = z.strictObject({
  company: z.string().min(1),
  role: z.string().min(1),
  sourceUrl: z.url().optional(),
  headlineId: z.string(),
  fit: z
    .array(z.strictObject({ requirement: z.string().min(3), evidenceIds: z.array(z.string()).min(1) }))
    .min(1)
    .max(FIT_ROWS_MAX),
  projectIds: z.array(z.string()).min(1).max(PROJECTS_MAX),
  skillIds: z.array(z.string()),
  /** Requirements with no matching evidence. Shown in review only, never published. */
  gaps: z.array(z.string()),
  coverNote: z.strictObject({
    whyRole: PostParagraph,
    whyMe: EvidenceParagraph,
    howIWork: EvidenceParagraph,
  }),
  /** Answers to the application form's own questions. Private: shown in review, never published. */
  formAnswers: z
    .array(
      z.strictObject({
        question: z.string().min(3),
        /** The form's character limit, if it has one. */
        limit: z.number().int().positive().optional(),
        answer: z.string().min(1),
        evidenceIds: z.array(z.string()).min(1),
      }),
    )
    .optional(),
});

export type Variant = z.infer<typeof Variant>;

/** Every ID a variant may cite: highlights, projects, decisions, skills, awards. */
export function citableIds(cv: Cv): Map<string, string> {
  const ids = new Map<string, string>();
  for (const e of cv.experience) for (const h of e.highlights) ids.set(h.id, h.text);
  for (const p of cv.projects) {
    ids.set(p.id, p.summary);
    for (const h of p.highlights ?? []) ids.set(h.id, h.text);
    for (const d of p.decisions ?? []) ids.set(d.id, `${d.chose}, over ${d.over}: ${d.because}`);
  }
  for (const s of cv.skills) ids.set(s.id, s.name);
  for (const a of cv.awards ?? []) ids.set(a.id, a.text);
  return ids;
}

const normalise = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Shape, then the rules that keep a tailored page honest. Returns every issue. */
export function validateVariant(raw: unknown, cv: Cv, postText: string, file = "variant"): Issue[] {
  const parsed = Variant.safeParse(raw);
  if (!parsed.success) return parsed.error.issues.map((i) => ({ file, path: i.path.join("."), message: i.message }));
  const v = parsed.data;
  const issues: Issue[] = [];
  const add = (path: string, message: string) => issues.push({ file, path, message });
  const ids = citableIds(cv);
  const post = normalise(postText);
  const quoted = (s: string) => post.includes(normalise(s));

  if (!cv.headlines.some((h) => h.id === v.headlineId)) add("headlineId", `unknown headline "${v.headlineId}"`);

  for (const [i, row] of v.fit.entries()) {
    if (!quoted(row.requirement)) add(`fit[${i}].requirement`, "must be quoted word for word from the job post");
    for (const [j, id] of row.evidenceIds.entries())
      if (!ids.has(id)) add(`fit[${i}].evidenceIds[${j}]`, `unknown id "${id}"`);
  }

  const projectIds = new Set(cv.projects.map((p) => p.id));
  for (const [i, id] of v.projectIds.entries())
    if (!projectIds.has(id)) add(`projectIds[${i}]`, `unknown project "${id}"`);
  if (new Set(v.projectIds).size !== v.projectIds.length) add("projectIds", "lists a project twice");

  const skillIds = new Set(cv.skills.map((s) => s.id));
  for (const [i, id] of v.skillIds.entries()) if (!skillIds.has(id)) add(`skillIds[${i}]`, `unknown skill "${id}"`);

  const { whyRole, whyMe, howIWork } = v.coverNote;
  for (const [i, q] of whyRole.postQuotes.entries())
    if (!quoted(q)) add(`coverNote.whyRole.postQuotes[${i}]`, "must be quoted word for word from the job post");
  for (const [name, para] of [
    ["whyMe", whyMe],
    ["howIWork", howIWork],
  ] as const)
    for (const [i, id] of para.evidenceIds.entries())
      if (!ids.has(id)) add(`coverNote.${name}.evidenceIds[${i}]`, `unknown id "${id}"`);

  const note = [whyRole.text, whyMe.text, howIWork.text].join(" ");
  if (words(note) > COVER_NOTE_WORDS_MAX)
    add("coverNote", `${words(note)} words; the limit is ${COVER_NOTE_WORDS_MAX}`);
  for (const phrase of BANNED_PHRASES)
    if (normalise(note).includes(phrase)) add("coverNote", `uses the banned phrase "${phrase}"`);

  for (const [i, f] of (v.formAnswers ?? []).entries()) {
    const path = `formAnswers[${i}]`;
    if (f.limit !== undefined && f.answer.length > f.limit)
      add(`${path}.answer`, `${f.answer.length} characters; the form allows ${f.limit}`);
    for (const [j, id] of f.evidenceIds.entries())
      if (!ids.has(id)) add(`${path}.evidenceIds[${j}]`, `unknown id "${id}"`);
    const grounding = `${f.evidenceIds.map((id) => ids.get(id) ?? "").join(" ")} ${postText}`;
    for (const n of f.answer.match(/\d[\d,.]*%?/g) ?? [])
      if (!grounding.includes(n.replace(/[.,]$/, "")))
        add(`${path}.answer`, `the number "${n}" appears in no cited item or the post`);
    for (const problem of countMismatches(f.answer)) add(`${path}.answer`, problem);
  }
  for (const [name, para] of Object.entries(v.coverNote))
    for (const problem of countMismatches(para.text)) add(`coverNote.${name}`, problem);

  // Numbers in the note must appear in a cited item, so the note can't inflate a claim.
  const cited = [...whyMe.evidenceIds, ...howIWork.evidenceIds].map((id) => ids.get(id) ?? "").join(" ");
  const sources = `${cited} ${postText}`;
  for (const n of note.match(/\d[\d,.]*%?/g) ?? [])
    if (!sources.includes(n)) add("coverNote", `the number "${n}" appears in no cited item or the post`);

  return issues;
}

const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/**
 * "I built 6 ways to connect: A, B and C" promises six items and lists three. Finds a
 * count followed by a colon-introduced list and checks the list adds up. Lists split
 * on commas and a final "and"/"or"; reword the sentence if an item contains a comma.
 */
export function countMismatches(text: string): string[] {
  const problems: string[] = [];
  const pattern = /\b(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+([a-z][a-z -]{0,60}?):\s*([^.;]+)/gi;
  for (const m of text.matchAll(pattern)) {
    const [, rawCount = "", noun = "", list = ""] = m;
    const promised = Number(rawCount) || NUMBER_WORDS[rawCount.toLowerCase()];
    if (!promised) continue;
    const items = list
      .split(/,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (items.length > 1 && items.length !== promised)
      problems.push(`says ${rawCount} ${noun.trim()} but lists ${items.length}: ${items.join(" | ")}`);
  }
  return problems;
}
