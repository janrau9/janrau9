import type { z } from "zod";
import { Cv } from "./cv.ts";
import { type WorkFile, WorkFrontmatter } from "./work.ts";

export interface Issue {
  file: string;
  path: string;
  message: string;
}

export const FEATURED_COUNT = 3;

const formatPath = (path: readonly PropertyKey[]) =>
  path
    .map((p) => (typeof p === "number" ? `[${p}]` : `.${String(p)}`))
    .join("")
    .replace(/^\./, "");

const zodIssues = (file: string, error: z.ZodError, prefix = ""): Issue[] =>
  error.issues.map((i) => ({
    file,
    path: [prefix, formatPath(i.path)].filter(Boolean).join("."),
    message: i.message,
  }));

/** Shape check, then the rules a type system can't express: unique IDs, references, counts. */
export function validateCv(raw: unknown, file = "content/cv.yaml"): { cv?: Cv; issues: Issue[] } {
  const parsed = Cv.safeParse(raw);
  if (!parsed.success) return { issues: zodIssues(file, parsed.error) };
  return { cv: parsed.data, issues: checkCvRules(parsed.data, file) };
}

export function checkCvRules(cv: Cv, file = "content/cv.yaml"): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, message: string) => issues.push({ file, path, message });

  // Every ID is unique across the whole file, because tailored variants reference them flatly.
  const seen = new Map<string, string>();
  const claim = (id: string, path: string) => {
    const first = seen.get(id);
    if (first) add(path, `duplicate id "${id}" (first used at ${first})`);
    else seen.set(id, path);
  };
  const owned = (childId: string, prefix: string, path: string) => {
    claim(childId, path);
    if (!childId.startsWith(prefix)) add(path, `must start with "${prefix}"`);
  };

  for (const [i, h] of cv.headlines.entries()) claim(h.id, `headlines[${i}].id`);
  for (const [i, e] of cv.experience.entries()) {
    claim(e.id, `experience[${i}].id`);
    for (const [j, h] of e.highlights.entries()) owned(h.id, `${e.id}.h`, `experience[${i}].highlights[${j}].id`);
    if (e.end !== null && e.end < e.start) add(`experience[${i}].end`, "ends before it starts");
  }
  for (const [i, e] of cv.education.entries()) {
    claim(e.id, `education[${i}].id`);
    if (e.end < e.start) add(`education[${i}].end`, "ends before it starts");
  }
  for (const [i, a] of (cv.awards ?? []).entries()) claim(a.id, `awards[${i}].id`);
  for (const [i, p] of cv.projects.entries()) {
    claim(p.id, `projects[${i}].id`);
    for (const [j, h] of (p.highlights ?? []).entries()) owned(h.id, `${p.id}.h`, `projects[${i}].highlights[${j}].id`);
    for (const [j, d] of (p.decisions ?? []).entries()) owned(d.id, `${p.id}.d.`, `projects[${i}].decisions[${j}].id`);
  }
  for (const [i, s] of cv.skills.entries()) claim(s.id, `skills[${i}].id`);

  // References point at projects that exist.
  const projectIds = new Set(cv.projects.map((p) => p.id));
  const ref = (target: string, path: string) => {
    if (!projectIds.has(target)) add(path, `unknown project "${target}"`);
  };
  for (const [i, e] of cv.experience.entries())
    for (const [j, h] of e.highlights.entries())
      for (const [k, p] of (h.projects ?? []).entries()) ref(p, `experience[${i}].highlights[${j}].projects[${k}]`);
  for (const [i, e] of cv.education.entries())
    for (const [k, p] of (e.projects ?? []).entries()) ref(p, `education[${i}].projects[${k}]`);
  for (const [i, a] of (cv.awards ?? []).entries()) if (a.project) ref(a.project, `awards[${i}].project`);

  if (!cv.headlines.some((h) => h.id === "hl.default")) add("headlines", 'needs a headline with id "hl.default"');

  const featured = cv.projects.filter((p) => p.featured).length;
  if (featured !== FEATURED_COUNT)
    add("projects", `exactly ${FEATURED_COUNT} projects must be featured; found ${featured}`);

  return issues;
}

/** Case studies must belong to a project and agree with it; every featured project needs one. */
export function validateWork(files: WorkFile[], cv: Cv): Issue[] {
  const issues: Issue[] = [];
  const projects = new Map(cv.projects.map((p) => [p.id, p]));
  const covered = new Set<string>();

  for (const f of files) {
    const parsed = WorkFrontmatter.safeParse(f.frontmatter);
    if (!parsed.success) {
      issues.push(...zodIssues(f.file, parsed.error, "frontmatter"));
      continue;
    }
    const fm = parsed.data;
    const add = (path: string, message: string) => issues.push({ file: f.file, path, message });
    const project = projects.get(fm.id);
    if (!project) {
      add("frontmatter.id", `unknown project "${fm.id}"; add it to cv.yaml first`);
      continue;
    }
    if (covered.has(fm.id)) add("frontmatter.id", `a second case study for "${fm.id}"`);
    covered.add(fm.id);
    if (fm.status !== project.status)
      add("frontmatter.status", `"${fm.status}" disagrees with cv.yaml ("${project.status}")`);
    if (Boolean(fm.featured) !== Boolean(project.featured)) add("frontmatter.featured", "disagrees with cv.yaml");
    if (!fm.draft && /\bTODO\b/.test(f.body)) add("body", "still contains TODO; finish it or set draft: true");
    if (!/^## /m.test(f.body)) add("body", "needs at least one ## section");
  }

  for (const p of cv.projects)
    if (p.featured && !covered.has(p.id))
      issues.push({ file: "content/work/", path: p.id, message: "featured project has no case study" });

  return issues;
}
