import type { Content, WorkFrontmatter } from "@janrau/schema";
import siteData from "../generated/site-data.json" with { type: "json" };

/**
 * Validated content, bundled at build time by `pnpm prepare:data` (packages/cv-render),
 * which fails the build if content is invalid. Pages never read content/ from disk,
 * because the Worker that renders tailored pages has no disk.
 */
export interface CaseStudyMeta {
  slug: string;
  frontmatter: WorkFrontmatter;
}

const data = siteData as unknown as { cv: Content["cv"]; work: (CaseStudyMeta & { id: string })[] };

/** Drafts render in `pnpm dev` and preview builds only; the deployed site never shows them. */
// Read at build time (Node). The Worker has no `process`, hence the optional chaining.
export const SHOW_DRAFTS = globalThis.process?.env?.SHOW_DRAFTS === "1";

export function content(): { cv: Content["cv"]; work: CaseStudyMeta[] } {
  return data;
}

export function publishedWork(): CaseStudyMeta[] {
  return data.work.filter((w) => SHOW_DRAFTS || !w.frontmatter.draft);
}

/** The case study page for a project, if one is published. */
export function workHref(projectId: string): string | undefined {
  const study = publishedWork().find((w) => w.frontmatter.id === projectId);
  return study ? `/work/${study.slug}` : undefined;
}

export const CV_PDF = "/janrau-beray-cv.pdf";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const month = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const period = (start: string, end: string | null) => `${month(start)} – ${end ? month(end) : "present"}`;
