import { resolve } from "node:path";
import { type CaseStudy, type Content, loadContent } from "@janrau/schema";

// Resolved from the site package, where astro runs; a path relative to this file breaks once bundled.
const CONTENT_DIR = resolve(process.cwd(), "../../content");

/** Drafts render in `pnpm dev` and preview builds only; the deployed site never shows them. */
export const SHOW_DRAFTS = process.env.SHOW_DRAFTS === "1";

let cached: Content | undefined;

/** Validated content. The build fails, listing every problem, if content is invalid. */
export function content(): Content {
  cached ??= loadContent(CONTENT_DIR);
  return cached;
}

export function publishedWork(): CaseStudy[] {
  return content().work.filter((w) => SHOW_DRAFTS || !w.frontmatter.draft);
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
