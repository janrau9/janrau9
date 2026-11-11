import type { Db } from "./tailored";

/**
 * Janrau's own visits: signed in to /admin, the browser carries Cloudflare Access's
 * CF_Authorization cookie. Those visits are never recorded. Only the cookie's presence is
 * checked; nothing about it is stored.
 */
export function isOwnerVisit(request: Request): boolean {
  return /(?:^|;\s*)CF_Authorization=/.test(request.headers.get("cookie") ?? "");
}

/** Events the browser may report. 'open' is recorded by the server only. */
export const CLIENT_EVENTS = ["human", "fit_viewed", "cv_download", "case_click", "elevator", "visit_end"] as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[number];
export type EventType = "open" | ClientEvent;

/** Link previewers and email security scanners announce themselves in the user agent. */
const SCANNER_AGENT =
  /bot\b|crawler|spider|preview|scanner|headless|python|curl|wget|go-http|java\/|okhttp|axios|node-fetch|facebookexternalhit|linkedin|slack|discord|whatsapp|telegram|skype|outlook|microsoft office|barracuda|proofpoint|mimecast|symantec|forcepoint|trend ?micro|zscaler|cisco|ironport/i;

/**
 * Networks people don't browse from: cloud providers and hosting companies, where email
 * scanners and link checkers run. By autonomous system number (ASN).
 */
export const DATACENTER_ASNS = new Set([
  16509,
  14618, // Amazon AWS
  15169,
  396982, // Google, Google Cloud
  8075,
  8068, // Microsoft, Azure
  13335, // Cloudflare
  14061, // DigitalOcean
  16276, // OVH
  24940, // Hetzner
  63949, // Akamai Linode
  31898, // Oracle Cloud
  45102, // Alibaba Cloud
  20473, // Vultr
]);

/** Opens this soon after publishing are almost always a scanner checking the link. */
export const TOO_FAST_SECONDS = 60;

export interface Visit {
  userAgent: string | null;
  asn: number | undefined;
  secondsSincePublish: number | undefined;
}

export type Verdict = { scanner: false } | { scanner: true; reason: "agent" | "network" | "too-fast" };

/** Decide, without storing anything personal, whether an open looks like a scanner. */
export function classifyOpen(v: Visit): Verdict {
  if (!v.userAgent || SCANNER_AGENT.test(v.userAgent)) return { scanner: true, reason: "agent" };
  if (v.asn !== undefined && DATACENTER_ASNS.has(v.asn)) return { scanner: true, reason: "network" };
  if (v.secondsSincePublish !== undefined && v.secondsSincePublish < TOO_FAST_SECONDS)
    return { scanner: true, reason: "too-fast" };
  return { scanner: false };
}

/** What ties an event to one visit, and what it was about. All optional. */
export interface EventContext {
  /** Random per page load, held only in that page's memory. */
  visit?: string | null;
  /** A case study slug, elevator term ids, or seconds read. */
  detail?: string | null;
  /** On 'human': device class and a hash of the network. */
  reader?: string | null;
}

/** Record an event, but only for a link that exists, so junk slugs can't fill the table. */
export async function recordEvent(
  db: Db,
  slug: string,
  type: EventType,
  verdict: Verdict = { scanner: false },
  now = Math.floor(Date.now() / 1000),
  context: EventContext = {},
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO events (slug, type, ts, scanner, reason, visit, detail, reader) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM applications WHERE slug = ?)",
    )
    .bind(
      slug,
      type,
      now,
      verdict.scanner ? 1 : 0,
      verdict.scanner ? verdict.reason : null,
      context.visit ?? null,
      context.detail ?? null,
      context.reader ?? null,
      slug,
    )
    .run();
}

/** A visit id: what the page generates with crypto.randomUUID(). */
export const VISIT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A case study's path segment, as in /work/<slug>. */
export const CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** The longest visit worth recording, in seconds: longer means a forgotten tab. */
export const MAX_VISIT_SECONDS = 6 * 3600;

/** Phone, tablet or desktop, from the user agent; nothing finer. */
export function deviceClass(userAgent: string | null): "phone" | "tablet" | "desktop" {
  const ua = userAgent ?? "";
  if (/ipad|tablet|kindle|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return "tablet";
  if (/mobi|iphone|ipod|android/i.test(ua)) return "phone";
  return "desktop";
}

/**
 * A reader, coarsely: the device class and a short hash of the network (the ASN, salted with
 * the link, so the same network hashes differently on every link). Enough to tell "another
 * device or network read this" from "the same reader came back"; not enough to say who.
 */
export async function readerKey(slug: string, asn: number | undefined, userAgent: string | null): Promise<string> {
  const bytes = new TextEncoder().encode(`${slug}:${asn ?? "?"}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const short = [...hash.slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${deviceClass(userAgent)}:${short}`;
}

export const STATUSES = ["draft", "applied", "interview", "rejected", "offer", "no_reply", "withdrawn"] as const;
export type Status = (typeof STATUSES)[number];

export interface ApplicationRow {
  slug: string;
  company: string;
  role: string;
  status: Status;
  published_at: number | null;
  human_opens: number;
  scanner_opens: number;
  last_human: number | null;
  first_human: number | null;
  followed_up_at: number | null;
  fit_views: number;
  cv_downloads: number;
  case_clicks: number;
  elevator_uses: number;
}

/** The funnel: each stage counts applications that reached it (or went further). */
export function funnel(rows: ApplicationRow[]) {
  const live = rows.filter((r) => r.status !== "withdrawn" && r.published_at !== null);
  const reachedInterview = (r: ApplicationRow) => r.status === "interview" || r.status === "offer";
  return [
    { stage: "Published", count: live.length },
    { stage: "Opened by a person", count: live.filter((r) => r.human_opens > 0).length },
    { stage: "CV downloaded", count: live.filter((r) => r.cv_downloads > 0).length },
    { stage: "Interview", count: live.filter(reachedInterview).length },
    { stage: "Offer", count: live.filter((r) => r.status === "offer").length },
  ];
}
