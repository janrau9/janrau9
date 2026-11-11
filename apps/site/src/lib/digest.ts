import siteData from "../generated/site-data.json" with { type: "json" };
import { GLOSSARY } from "./elevator-terms";
import { type Mailer, NOTIFY_FROM } from "./notify";
import type { Db } from "./tailored";

/**
 * One email per visit to a published link, sent once the visit has gone quiet: how long the
 * person read, what they looked at, whether they are a new reader (another device or
 * network than before, so the link was probably shared), and prep notes for any tech they
 * asked elevator mode about that I don't have.
 */

/** A visit is over once nothing has happened for this long. */
export const QUIET_SECONDS = 10 * 60;
/** Older visits are history, not news: the first run after a deploy must not send a backlog. */
export const STALE_SECONDS = 2 * 86400;

const WORK = new Map(
  (siteData as unknown as { work: { slug: string; frontmatter: { title: string } }[] }).work.map((w) => [
    w.slug,
    w.frontmatter.title,
  ]),
);
const TERMS = new Map(GLOSSARY.map((t) => [t.id, t]));

export interface VisitEvent {
  type: string;
  ts: number;
  detail: string | null;
  reader: string | null;
}

export interface Visit {
  visit: string;
  slug: string;
  company: string;
  role: string;
  events: VisitEvent[];
  /** Readers seen on this link before this visit began. */
  earlierReaders: string[];
  /** Whether any person read this link before this visit began. */
  readBefore: boolean;
}

export type ReaderKind = "first" | "returning" | "new" | "unknown";

/**
 * First reader ever; the same device and network as before; someone new, probably shared;
 * or unknown, when the earlier reads predate reader keys.
 */
export function readerKind(v: Visit): ReaderKind {
  if (!v.readBefore) return "first";
  if (v.earlierReaders.length === 0) return "unknown";
  const reader = v.events.find((e) => e.type === "human")?.reader;
  return reader && v.earlierReaders.includes(reader) ? "returning" : "new";
}

/** Seconds read: what the page reported when it was hidden, else first to last event. */
export function secondsRead(events: VisitEvent[]): number {
  const reported = events.filter((e) => e.type === "visit_end").map((e) => Number(e.detail) || 0);
  if (reported.length) return Math.max(...reported);
  const ts = events.map((e) => e.ts);
  return Math.max(...ts) - Math.min(...ts);
}

const duration = (s: number) => (s < 60 ? `${s} s` : `${Math.round(s / 60)} min`);
const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
const unique = <T>(xs: T[]) => [...new Set(xs)];

/** The email for one visit. */
export function digest(v: Visit): { subject: string; text: string } {
  const kind = readerKind(v);
  const has = (t: string) => v.events.some((e) => e.type === t);
  const cases = unique(v.events.filter((e) => e.type === "case_click" && e.detail).map((e) => e.detail as string));
  const termIds = unique(
    v.events.filter((e) => e.type === "elevator" && e.detail).flatMap((e) => (e.detail as string).split(" ")),
  ).filter((id) => TERMS.has(id) && id !== "none");
  const terms = termIds.map((id) => TERMS.get(id)).filter((t) => t !== undefined);

  const did: string[] = [`Read for ${duration(secondsRead(v.events))}.`];
  if (has("fit_viewed")) did.push("Viewed the fit table.");
  if (cases.length)
    did.push(
      `Opened the case ${cases.length === 1 ? "study" : "studies"}: ${list(cases.map((c) => WORK.get(c) ?? c))}.`,
    );
  if (has("elevator"))
    did.push(terms.length ? `Asked elevator mode about ${list(terms.map((t) => t.label))}.` : "Used elevator mode.");
  if (has("cv_download")) did.push("Downloaded the CV.");

  // Prep: what they probed that I don't have, with the closest work I do.
  const gaps = terms.filter((t) => t.status !== "have");
  const prep = gaps.map((t) => {
    const near = (t.near ?? []).map((id) => TERMS.get(id)?.label ?? id);
    const what = t.status === "adjacent" ? "adjacent to my work" : "not in my work yet";
    return `- ${t.label}: ${what}.${near.length ? ` Closest: ${list(near)}.` : ""}`;
  });

  const who =
    kind === "first"
      ? "The first person to read it."
      : kind === "returning"
        ? "A returning reader: the same device and network as an earlier visit."
        : kind === "new"
          ? "A new reader: another device or network than any earlier visit, so the link was probably shared."
          : "Read before; whether by the same person is unknown (those visits predate reader tracking).";
  const headline =
    kind === "new"
      ? "a new reader (probably shared)"
      : has("cv_download")
        ? "read, CV downloaded"
        : kind === "returning" || kind === "unknown"
          ? "read again"
          : "read by a person";

  return {
    subject: `${v.company}: ${headline}`,
    text: [
      `Your application to ${v.company} (${v.role}).`,
      "",
      who,
      ...did,
      ...(prep.length ? ["", "They asked about something you don't have. Be ready:", ...prep] : []),
      "",
      `Review page: https://janrau.dev/admin/review/${v.slug}`,
      "Dashboard: https://janrau.dev/admin",
      "",
      "One email per visit, sent once it has been quiet for 10 minutes.",
    ].join("\n"),
  };
}

/** Visits that are over, read by a person, on a live link, and not yet emailed. */
export async function pendingVisits(db: Db, now = Math.floor(Date.now() / 1000)): Promise<Visit[]> {
  const { results } = await db
    .prepare(
      `SELECT e.visit, e.slug, a.company, a.role, MIN(e.ts) AS first
         FROM events e JOIN applications a ON a.slug = e.slug
        WHERE e.visit IS NOT NULL AND e.scanner = 0
          AND a.published_at IS NOT NULL AND a.status != 'withdrawn'
          AND e.visit NOT IN (SELECT visit FROM digests)
        GROUP BY e.visit
       HAVING SUM(e.type = 'human') > 0 AND MAX(e.ts) <= ? AND MIN(e.ts) >= ?
        LIMIT 20`,
    )
    .bind(now - QUIET_SECONDS, now - STALE_SECONDS)
    .all<{ visit: string; slug: string; company: string; role: string; first: number }>();
  const visits: Visit[] = [];
  for (const r of results) {
    const events = (
      await db
        .prepare("SELECT type, ts, detail, reader FROM events WHERE visit = ? ORDER BY ts, id")
        .bind(r.visit)
        .all<VisitEvent>()
    ).results;
    const earlier = (
      await db
        .prepare(
          "SELECT DISTINCT reader FROM events WHERE slug = ? AND type = 'human' AND ts < ? AND (visit IS NULL OR visit != ?)",
        )
        .bind(r.slug, r.first, r.visit)
        .all<{ reader: string | null }>()
    ).results;
    visits.push({
      visit: r.visit,
      slug: r.slug,
      company: r.company,
      role: r.role,
      events,
      earlierReaders: earlier.map((e) => e.reader).filter((x): x is string => x !== null),
      readBefore: earlier.length > 0,
    });
  }
  return visits;
}

/**
 * Email each finished visit once. Claiming the digest row first makes it once-only even when
 * two runs overlap; a failed send releases the claim, so the next run tries again. With
 * `dryRun`, nothing is claimed or sent: the emails are only returned.
 */
export async function sendDigests(
  db: Db,
  mailer: Mailer | undefined,
  to: string | undefined,
  options: { now?: number; dryRun?: boolean } = {},
): Promise<{ subject: string; text: string }[]> {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const out: { subject: string; text: string }[] = [];
  for (const v of await pendingVisits(db, now)) {
    const mail = digest(v);
    out.push(mail);
    if (options.dryRun || !mailer || !to) continue;
    const claimed = await db
      .prepare("INSERT INTO digests (visit, slug, sent_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING RETURNING visit")
      .bind(v.visit, v.slug, now)
      .first<{ visit: string }>();
    if (!claimed) continue;
    try {
      await mailer.send({ to, from: NOTIFY_FROM, ...mail });
    } catch (err) {
      await db.prepare("DELETE FROM digests WHERE visit = ?").bind(v.visit).run();
      throw err;
    }
  }
  return out;
}
