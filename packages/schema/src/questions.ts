import { z } from "zod";
import type { Cv } from "./cv.ts";
import { glossaryCitableIds } from "./glossary.ts";
import type { Issue } from "./validate.ts";

/**
 * Questions recruiters ask that ranking answers badly, each with a curated answer for
 * elevator mode: passages quoted in my order, my own words, or "let's talk".
 */
export const AnswerKind = z.enum(["quotes", "words", "conversation"]);

/**
 * A cited passage: a cv.yaml id, or a heading in prose plus the passage's opening words,
 * "work:slash#outcome › Delivery: about". Prose ids are numbered by position, so a
 * citation names the words instead and survives edits elsewhere in the case study.
 */
export const PROSE_CITE = /^(work:[a-z0-9-]+|adr:\d{3})#[a-z0-9-]+ › .+$/;

export const Question = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase words joined by dashes"),
  question: z.string().min(1),
  /** Other ways people ask it. Each is embedded; the closest one decides the match. */
  phrasings: z.array(z.string().min(1)).min(1),
  answer: AnswerKind,
  /** My own words, for `words`. */
  words: z.string().min(1).optional(),
  /** Passages shown in this order: the answer for `quotes`, proof under `words`. */
  cite: z.array(z.string().min(1)).optional(),
});

export const Questions = z.strictObject({ questions: z.array(Question).min(1) });

export type Question = z.infer<typeof Question>;
export type Questions = z.infer<typeof Questions>;

/** Unique ids, the fields each kind needs, and cv.yaml citations that resolve. Prose citations resolve at index build. */
export function checkQuestions(q: Questions, cv: Cv, file = "content/questions.yaml"): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, message: string) => issues.push({ file, path, message });
  // Everything elevator mode indexes from cv.yaml: what a glossary cites, plus education and awards.
  const ids = new Set([
    ...glossaryCitableIds(cv),
    ...cv.education.map((e) => e.id),
    ...(cv.awards ?? []).map((a) => a.id),
  ]);
  const seen = new Set<string>();
  for (const [i, x] of q.questions.entries()) {
    const at = (k: string) => `questions[${i}].${k}`;
    if (seen.has(x.id)) add(at("id"), `duplicate id "${x.id}"`);
    seen.add(x.id);
    if (x.answer === "words" && !x.words) add(at("words"), `"${x.id}" answers in my words, so it needs words`);
    if (x.answer !== "words" && x.words) add(at("words"), `"${x.id}" is "${x.answer}"; words are only for "words"`);
    if (x.answer === "quotes" && !x.cite?.length) add(at("cite"), `"${x.id}" answers with quotes, so it must cite`);
    if (x.answer === "conversation" && x.cite?.length) add(at("cite"), `"${x.id}" is a conversation; it cites nothing`);
    for (const c of x.cite ?? []) if (!PROSE_CITE.test(c) && !ids.has(c)) add(at("cite"), `unknown cv.yaml id "${c}"`);
  }
  return issues;
}
