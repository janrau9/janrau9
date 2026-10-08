import { z } from "zod";
import type { Cv } from "./cv.ts";
import type { Issue } from "./validate.ts";
import { citableIds } from "./variant.ts";

/**
 * Tech terms visitors type into elevator mode, with the truth attached. A status is a
 * claim about Janrau, so "have" must cite cv.yaml and the others must point at terms
 * that are "have".
 */
export const TermStatus = z.enum(["have", "adjacent", "not-yet"]);

const termId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase words joined by dashes");

export const Term = z.strictObject({
  id: termId,
  label: z.string().min(1),
  group: z.string().min(1),
  /** Spellings people type: "golang", "go lang". */
  aliases: z.array(z.string().min(1)),
  status: TermStatus,
  /** cv.yaml ids, or `lang:<Name>` for a language in person.languages. Required for "have". */
  evidence: z.array(z.string()).optional(),
  /** The closest terms I have. Required for "adjacent" and "not-yet". */
  near: z.array(termId).optional(),
  /** cv.yaml items that show the close work directly. */
  nearEvidence: z.array(z.string()).optional(),
  /** A broad term's parts: "devops" covers ci, docker, monitoring. */
  related: z.array(termId).optional(),
});

export const Glossary = z.strictObject({ terms: z.array(Term).min(1) });

export type Term = z.infer<typeof Term>;
export type Glossary = z.infer<typeof Glossary>;

/** The person facts elevator mode quotes as "About me" passages. */
export const PERSON_IDS = ["person.about", "person.ai", "person.where", "person.languages"] as const;

/** Every id a glossary may cite: what a variant may cite, plus jobs, `lang:<Name>` and the person facts. */
export function glossaryCitableIds(cv: Cv): Set<string> {
  return new Set([
    ...citableIds(cv).keys(),
    ...cv.experience.map((e) => e.id),
    ...cv.person.languages.map((l) => `lang:${l.name}`),
    ...PERSON_IDS,
  ]);
}

/** The rules a type can't express: unique ids and aliases, citations that resolve. */
export function checkGlossary(g: Glossary, cv: Cv, file = "content/glossary.yaml"): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, message: string) => issues.push({ file, path, message });
  const ids = glossaryCitableIds(cv);
  const byId = new Map<string, Term>();
  const spellings = new Map<string, string>();

  for (const [i, t] of g.terms.entries()) {
    if (byId.has(t.id)) add(`terms[${i}].id`, `duplicate id "${t.id}"`);
    byId.set(t.id, t);
    for (const s of [t.id, t.label, ...t.aliases].map((a) => a.toLowerCase())) {
      const owner = spellings.get(s);
      if (owner && owner !== t.id) add(`terms[${i}]`, `"${s}" already matches "${owner}"`);
      spellings.set(s, t.id);
    }
  }
  for (const [i, t] of g.terms.entries()) {
    const at = (k: string) => `terms[${i}].${k}`;
    if (t.status === "have" && !t.evidence?.length) add(at("evidence"), `"${t.id}" is "have", so it must cite cv.yaml`);
    if (t.status !== "have" && t.evidence?.length) add(at("evidence"), `"${t.id}" is "${t.status}"; use nearEvidence`);
    if (t.status !== "have" && !t.near?.length) add(at("near"), `"${t.id}" needs the closest terms I have`);
    for (const k of ["evidence", "nearEvidence"] as const)
      for (const id of t[k] ?? []) if (!ids.has(id)) add(at(k), `unknown cv.yaml id "${id}"`);
    for (const k of ["near", "related"] as const)
      for (const id of t[k] ?? []) {
        const target = byId.get(id);
        if (!target) add(at(k), `unknown term "${id}"`);
        else if (target.status !== "have") add(at(k), `"${id}" is "${target.status}"; point at terms I have`);
      }
  }
  return issues;
}
