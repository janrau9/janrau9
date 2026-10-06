/** What a job-post URL points at, so the cheapest reliable fetch can be chosen. */
export type Target =
  | { kind: "linkedin" }
  | { kind: "greenhouse"; board: string; id: string }
  | { kind: "ashby"; org: string; id: string }
  | { kind: "web"; url: string };

export function detect(raw: string): Target {
  const url = new URL(raw);
  const host = url.hostname.replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return { kind: "linkedin" };

  // job-boards.greenhouse.io/<board>/jobs/<id>, boards.greenhouse.io/<board>/jobs/<id>
  if (/(^|\.)greenhouse\.io$/.test(host) && parts[1] === "jobs" && parts[0] && parts[2])
    return { kind: "greenhouse", board: parts[0], id: parts[2] };
  // Company sites embedding Greenhouse pass the job id as ?gh_jid=; the board isn't known, so use the page.

  // jobs.ashbyhq.com/<org>/<uuid>
  if (host === "jobs.ashbyhq.com" && parts[0] && parts[1]) return { kind: "ashby", org: parts[0], id: parts[1] };

  return { kind: "web", url: url.toString() };
}
