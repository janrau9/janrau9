import { ashby, greenhouse } from "./ats.ts";
import { detect } from "./detect.ts";
import { readJsonLd } from "./jsonld.ts";
import { isChallenge, readMainText } from "./readable.ts";
import { tidy } from "./text.ts";
import { type Fetcher, type JobPost, NeedsPaste, type Renderer } from "./types.ts";

export const MIN_TEXT = 300;
/** Honest about who is asking: one request, triggered by a person, no disguise. */
export const USER_AGENT = "Mozilla/5.0 (compatible; janrau.dev job-post reader; +https://janrau.dev)";

const defaultFetch: Fetcher = (url, init) =>
  fetch(url, {
    ...init,
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/json", ...init?.headers },
  });

/** A post must name a role and a company and carry enough text to quote from. */
export function qualityProblem(p: {
  role?: string | undefined;
  company?: string | undefined;
  text?: string | undefined;
}): string | undefined {
  if (!p.role?.trim()) return "no job title found";
  if (!p.company?.trim()) return "no company found";
  if ((p.text?.length ?? 0) < MIN_TEXT) return `only ${p.text?.length ?? 0} characters of text (need ${MIN_TEXT})`;
  return undefined;
}

/** Structured data can be wrong (one board tagged a hybrid job as remote). The post's text wins. */
export function findConflicts(structured: { remote?: boolean | undefined }, text: string): string[] {
  const conflicts: string[] = [];
  if (structured.remote && /\b(hybrid|on-?site|in[- ]person|office presence|from our office)\b/i.test(text))
    conflicts.push("Structured data says remote, but the post text mentions hybrid or office work. Trust the text.");
  return conflicts;
}

/** A pasted post: company and role come from the drafting step if the first lines don't say. */
export function fromPaste(text: string, hint: { company?: string; role?: string } = {}): JobPost {
  const clean = tidy(text);
  const post: JobPost = {
    company: hint.company ?? "",
    role: hint.role ?? clean.split("\n")[0]?.slice(0, 120) ?? "",
    text: clean,
    source: { step: "paste", fetchedAt: new Date().toISOString() },
    conflicts: [],
  };
  if (clean.length < MIN_TEXT) throw new NeedsPaste(`The pasted text is too short (${clean.length} characters).`);
  return post;
}

/**
 * The fetch ladder: the cheapest reliable method first, stopping at the first result that
 * passes the quality gate. A block, login wall or challenge is never fought: the answer is
 * "paste the text".
 */
export async function fetchPost(
  rawUrl: string,
  options: { fetcher?: Fetcher; render?: Renderer } = {},
): Promise<JobPost> {
  const fetcher = options.fetcher ?? defaultFetch;
  const target = detect(rawUrl);
  const attempts: string[] = [];
  const now = () => new Date().toISOString();

  if (target.kind === "linkedin")
    throw new NeedsPaste(
      "LinkedIn isn't fetched (its terms forbid it). Paste the post's text, or use the 'Apply on company website' link.",
    );

  // 1. Applicant tracking system APIs.
  if (target.kind === "greenhouse" || target.kind === "ashby") {
    try {
      const p =
        target.kind === "greenhouse"
          ? await greenhouse(fetcher, target.board, target.id)
          : await ashby(fetcher, target.org, target.id);
      const problem = qualityProblem(p);
      if (!problem)
        return {
          company: p.company,
          role: p.role,
          ...(p.location ? { location: p.location } : {}),
          text: p.text,
          source: { url: rawUrl, step: "ats", ats: p.ats, fetchedAt: now() },
          conflicts: [],
        };
      attempts.push(`${p.ats} API: ${problem}`);
    } catch (err) {
      attempts.push((err as Error).message);
    }
  }

  // 2 and 3. A plain GET, then embedded JobPosting data, then the page's main text.
  const pageUrl = target.kind === "web" ? target.url : rawUrl;
  let html = "";
  try {
    const res = await fetcher(pageUrl);
    html = await res.text();
    const blocked = isChallenge(res.status, html);
    if (blocked) attempts.push(`page: ${blocked}`);
    else {
      const ld = readJsonLd(html);
      if (ld) {
        const problem = qualityProblem(ld);
        if (!problem)
          return {
            company: ld.company ?? "",
            role: ld.role ?? "",
            ...(ld.location ? { location: ld.location } : {}),
            text: ld.text ?? "",
            source: { url: rawUrl, step: "json-ld", fetchedAt: now() },
            conflicts: findConflicts(ld, ld.text ?? ""),
          };
        attempts.push(`embedded job data: ${problem}`);
      } else attempts.push("embedded job data: none on the page");

      const main = readMainText(html, pageUrl);
      if (main.text.length >= MIN_TEXT)
        return {
          company: ld?.company ?? "",
          role: ld?.role ?? main.title ?? "",
          text: main.text,
          source: { url: rawUrl, step: "readable", fetchedAt: now() },
          conflicts: [],
        };
      attempts.push(`page text: only ${main.text.length} characters (probably built by JavaScript)`);
    }
  } catch (err) {
    attempts.push(`page: ${(err as Error).message}`);
  }

  // 4. A real browser, for pages built by JavaScript.
  if (options.render) {
    try {
      const rendered = await options.render(pageUrl);
      const blocked = isChallenge(200, rendered);
      if (blocked) attempts.push(`browser: ${blocked}`);
      else {
        const ld = readJsonLd(rendered);
        const main = readMainText(rendered, pageUrl);
        const text = ld?.text && ld.text.length >= MIN_TEXT ? ld.text : main.text;
        if (text.length >= MIN_TEXT)
          return {
            company: ld?.company ?? "",
            role: ld?.role ?? main.title ?? "",
            text,
            source: { url: rawUrl, step: "headless", fetchedAt: now() },
            conflicts: ld ? findConflicts(ld, text) : [],
          };
        attempts.push(`browser: only ${text.length} characters`);
      }
    } catch (err) {
      attempts.push(`browser: ${(err as Error).message}`);
    }
  } else attempts.push("browser: not available here");

  // 5. Ask for the text.
  throw new NeedsPaste("Couldn't read this post automatically. Paste its text instead.", attempts);
}
