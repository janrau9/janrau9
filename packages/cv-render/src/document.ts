import type { Content } from "@janrau/schema";

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
    facts: [person.workRights, person.availability, workPreference(person.workPreferences)],
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
