import type { Cv } from "./cv.ts";
import type { Variant } from "./variant.ts";

/** What the tailored page needs about case studies: no bodies, so it fits in a Worker. */
export interface WorkRef {
  slug: string;
  id: string;
  draft: boolean;
}

export interface TailoredView {
  company: string;
  role: string;
  headline: string;
  person: {
    name: string;
    location: string;
    workRights: string;
    availability: string;
    workMode: string;
    email: string;
    github: string;
    linkedin: string;
  };
  fit: { requirement: string; evidence: { text: string; href?: string }[] }[];
  projects: { name: string; summary: string; stack: string[]; href?: string }[];
  coverNote: { whyRole: string; whyMe: string; howIWork: string };
  experience: { role: string; org: string; start: string; end: string | null; highlights: string[] }[];
  skills: string[];
}

export const EXPERIENCE_HIGHLIGHTS_MAX = 3;

/**
 * Resolve a variant against the current CV. IDs that no longer exist are dropped, not
 * fatal: a link sent months ago keeps working after cv.yaml changes.
 */
export function resolveVariant(cv: Cv, work: WorkRef[], v: Variant): TailoredView {
  const published = new Map(work.filter((w) => !w.draft).map((w) => [w.id, `/work/${w.slug}`]));
  const projectOf = new Map<string, string>();
  const text = new Map<string, string>();
  for (const e of cv.experience) for (const h of e.highlights) text.set(h.id, h.text);
  for (const p of cv.projects) {
    text.set(p.id, p.summary);
    projectOf.set(p.id, p.id);
    for (const h of p.highlights ?? []) {
      text.set(h.id, h.text);
      projectOf.set(h.id, p.id);
    }
    for (const d of p.decisions ?? []) {
      text.set(d.id, `Chose ${d.chose.toLowerCase()} over ${d.over.toLowerCase()}: ${d.because}`);
      projectOf.set(d.id, p.id);
    }
  }
  for (const s of cv.skills) text.set(s.id, s.name);
  for (const a of cv.awards ?? []) text.set(a.id, a.text);

  const href = (id: string) => {
    const project = projectOf.get(id);
    return project ? published.get(project) : undefined;
  };

  const fit = v.fit
    .map((row) => ({
      requirement: row.requirement,
      evidence: row.evidenceIds.flatMap((id) => {
        const t = text.get(id);
        if (!t) return [];
        const link = href(id);
        return [link ? { text: t, href: link } : { text: t }];
      }),
    }))
    .filter((row) => row.evidence.length > 0);

  const projects = v.projectIds.flatMap((id) => {
    const p = cv.projects.find((x) => x.id === id);
    if (!p) return [];
    const link = published.get(p.id);
    return [{ name: p.name, summary: p.summary, stack: p.stack, ...(link ? { href: link } : {}) }];
  });

  // Highlights the variant cites come first within each job.
  const cited = new Set([
    ...v.fit.flatMap((f) => f.evidenceIds),
    ...v.coverNote.whyMe.evidenceIds,
    ...v.coverNote.howIWork.evidenceIds,
  ]);
  const experience = cv.experience.map((e) => ({
    role: e.role,
    org: e.org,
    start: e.start,
    end: e.end,
    highlights: [...e.highlights]
      .sort((a, b) => Number(cited.has(b.id)) - Number(cited.has(a.id)))
      .slice(0, EXPERIENCE_HIGHLIGHTS_MAX)
      .map((h) => h.text),
  }));

  const chosen = v.skillIds.filter((id) => cv.skills.some((s) => s.id === id));
  const skills = [...chosen, ...cv.skills.map((s) => s.id).filter((id) => !chosen.includes(id))].map(
    (id) => cv.skills.find((s) => s.id === id)?.name ?? "",
  );

  const { person } = cv;
  const p = person.workPreferences;
  const modes = [p.remote && "remote", p.hybrid && "hybrid"].filter(Boolean).join(" or ");
  return {
    company: v.company,
    role: v.role,
    headline: cv.headlines.find((h) => h.id === v.headlineId)?.text ?? cv.headlines[0]?.text ?? "",
    person: {
      name: person.name,
      location: person.location,
      workRights: person.workRights,
      availability: person.availability,
      workMode: `Open to ${modes || "on-site"} work`,
      email: person.links.email,
      github: person.links.github,
      linkedin: person.links.linkedin,
    },
    fit,
    projects,
    coverNote: {
      whyRole: v.coverNote.whyRole.text,
      whyMe: v.coverNote.whyMe.text,
      howIWork: v.coverNote.howIWork.text,
    },
    experience,
    skills,
  };
}
