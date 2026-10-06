import { htmlToText, unescapeHtml } from "./text.ts";
import type { Fetcher } from "./types.ts";

export interface AtsPost {
  ats: string;
  role: string;
  company: string;
  location?: string;
  text: string;
}

/** Greenhouse's public job-board API: clean, structured, no scraping. */
export async function greenhouse(fetcher: Fetcher, board: string, id: string): Promise<AtsPost> {
  const res = await fetcher(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}?content=true`);
  if (!res.ok) throw new Error(`Greenhouse API: HTTP ${res.status}`);
  const d = (await res.json()) as {
    title?: string;
    company_name?: string;
    location?: { name?: string };
    content?: string;
  };
  return {
    ats: "greenhouse",
    role: d.title ?? "",
    company: d.company_name ?? board,
    ...(d.location?.name ? { location: d.location.name } : {}),
    // Greenhouse escapes the HTML once more; unescape, then convert.
    text: htmlToText(unescapeHtml(d.content ?? "")),
  };
}

/** Ashby's public posting API lists a board's jobs; pick the one by id. */
export async function ashby(fetcher: Fetcher, org: string, id: string): Promise<AtsPost> {
  const res = await fetcher(`https://api.ashbyhq.com/posting-api/job-board/${org}?includeCompensation=true`);
  if (!res.ok) throw new Error(`Ashby API: HTTP ${res.status}`);
  const d = (await res.json()) as {
    jobs?: { id: string; title?: string; location?: string; descriptionHtml?: string; descriptionPlain?: string }[];
  };
  const job = d.jobs?.find((j) => j.id === id);
  if (!job) throw new Error(`Ashby API: no job ${id} on board ${org} (closed?)`);
  return {
    ats: "ashby",
    role: job.title ?? "",
    company: org,
    ...(job.location ? { location: job.location } : {}),
    text: job.descriptionHtml ? htmlToText(job.descriptionHtml) : (job.descriptionPlain ?? ""),
  };
}
