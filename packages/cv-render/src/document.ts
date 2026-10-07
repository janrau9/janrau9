import type { Content } from "@janrau/schema";
import { resolveVariant } from "@janrau/schema/tailor";
import type { Variant } from "@janrau/schema/variant";

/**
 * The data a CV template renders: already selected and ordered, so templates
 * (Typst today, tailored variants later) never decide what to include.
 */
export interface CvDocument {
  name: string;
  headline: string;
  contact: { location: string; email: string; phone?: string; github: string; linkedin: string; site: string };
  facts: string[];
  about: string;
  experience: { role: string; org: string; location: string; period: string; highlights: string[] }[];
  projects: { name: string; summary: string; stack: string; status: string; highlights: string[] }[];
  education: { programme: string; org: string; period: string }[];
  awards: string[];
  licenses: string[];
  skills: string[];
  /** Tailored CVs only: the 3-paragraph note for one company. */
  coverNote?: { company: string; paragraphs: string[] };
}

export interface DocumentOptions {
  /** Printed on PDFs only. Comes from the environment, never from the repo. */
  phone?: string | undefined;
  site: string;
  headlineId?: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const period = (start: string, end: string | null) => `${month(start)} – ${end ? month(end) : "present"}`;

const STATUS: Record<string, string> = {
  live: "Live",
  "in-use": "In use",
  beta: "Beta",
  building: "Building",
  archived: "Archived",
};

/** Projects on the general CV: featured first, then other active work. Hive projects sit under education. */
const GENERAL_PROJECT_LIMIT = 7;

export function buildCvDocument({ cv }: Content, options: DocumentOptions): CvDocument {
  const headline = cv.headlines.find((h) => h.id === (options.headlineId ?? "hl.default"));
  if (!headline) throw new Error(`unknown headline "${options.headlineId}"`);

  const educationProjects = new Set(cv.education.flatMap((e) => e.projects ?? []));
  const projects = [
    ...cv.projects.filter((p) => p.featured),
    ...cv.projects.filter((p) => !p.featured && !educationProjects.has(p.id) && p.status !== "archived"),
  ].slice(0, GENERAL_PROJECT_LIMIT);

  const { person } = cv;
  return {
    name: person.name,
    headline: headline.text,
    contact: {
      location: person.location,
      email: person.links.email,
      ...(options.phone ? { phone: options.phone } : {}),
      github: person.links.github.replace(/^https?:\/\/(www\.)?/, ""),
      linkedin: person.links.linkedin.replace(/^https?:\/\/(www\.)?/, ""),
      site: options.site.replace(/^https?:\/\//, ""),
    },
    facts: [person.workRights, person.availability, workPreference(person.workPreferences)].filter((f): f is string =>
      Boolean(f),
    ),
    about: person.about,
    experience: cv.experience.map((e) => ({
      role: e.role,
      org: e.org,
      location: e.location,
      period: period(e.start, e.end),
      highlights: e.highlights.map((h) => h.text),
    })),
    projects: projects.map((p) => ({
      name: p.name,
      summary: p.summary,
      stack: p.stack.join(", "),
      status: STATUS[p.status] ?? p.status,
      highlights: (p.highlights ?? []).slice(0, p.featured ? 3 : 2).map((h) => h.text),
    })),
    education: cv.education.map((e) => ({ programme: e.programme, org: e.org, period: period(e.start, e.end) })),
    awards: (cv.awards ?? []).map((a) => a.text),
    licenses: cv.licenses ?? [],
    skills: cv.skills.map((s) => s.name),
  };
}

function workPreference(p: { remote: boolean; hybrid: boolean; relocation: boolean }): string {
  const modes = [p.remote && "remote", p.hybrid && "hybrid"].filter(Boolean).join(" or ");
  return `Open to ${modes || "on-site"} work${p.relocation ? " and relocation" : ""}`;
}

/**
 * The tailored CV for one application: the variant's headline, its chosen projects
 * first, cited highlights first, its skills first, and the cover note. Built from the
 * same resolver as the tailored page, so the page and the PDF always agree.
 */
export function buildTailoredDocument(content: Content, variant: Variant, options: DocumentOptions): CvDocument {
  const { cv } = content;
  const refs = content.work.map((w) => ({ slug: w.slug, id: w.frontmatter.id, draft: w.frontmatter.draft }));
  const view = resolveVariant(cv, refs, variant);
  const general = buildCvDocument(content, { ...options, headlineId: variant.headlineId });

  const chosen = variant.projectIds.flatMap((id) => cv.projects.filter((p) => p.id === id));
  const educationProjects = new Set(cv.education.flatMap((e) => e.projects ?? []));
  const rest = cv.projects.filter(
    (p) => !variant.projectIds.includes(p.id) && !educationProjects.has(p.id) && p.status !== "archived",
  );
  const projects = [...chosen, ...rest].slice(0, GENERAL_PROJECT_LIMIT).map((p) => ({
    name: p.name,
    summary: p.summary,
    stack: p.stack.join(", "),
    status: STATUS[p.status] ?? p.status,
    highlights: (p.highlights ?? []).slice(0, variant.projectIds.includes(p.id) ? 3 : 1).map((h) => h.text),
  }));

  return {
    ...general,
    experience: general.experience.map((e, i) => ({
      ...e,
      highlights: view.experience[i]?.highlights ?? e.highlights,
    })),
    projects,
    skills: view.skills,
    coverNote: {
      company: variant.company,
      paragraphs: [view.coverNote.whyRole, view.coverNote.whyMe, view.coverNote.howIWork],
    },
  };
}
