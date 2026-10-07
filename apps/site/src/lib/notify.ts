import type { Db } from "./tailored";

/** The part of Cloudflare's send_email binding used here. */
export interface Mailer {
  send(message: { to: string; from: string; subject: string; text: string }): Promise<{ messageId: string }>;
}

export const NOTIFY_FROM = "notify@janrau.dev";

/** The events worth an email, and the column that records it was sent. */
const FIRSTS = {
  human: { column: "notified_human_at", what: "opened by a person" },
  cv_download: { column: "notified_cv_at", what: "CV downloaded" },
} as const;
export type NotifyEvent = keyof typeof FIRSTS;
export const isNotifyEvent = (t: string): t is NotifyEvent => t in FIRSTS;

/**
 * Email Janrau the first time a published link is read by a person, and the first time its
 * CV is downloaded. Claiming the column first makes this once-only even when two beacons race;
 * a failed send releases the claim, so the next event tries again.
 */
export async function notifyFirst(
  db: Db,
  mailer: Mailer,
  to: string,
  slug: string,
  event: NotifyEvent,
  now = Math.floor(Date.now() / 1000),
): Promise<"sent" | "already"> {
  const { column, what } = FIRSTS[event];
  const claimed = await db
    .prepare(
      `UPDATE applications SET ${column} = ? WHERE slug = ? AND ${column} IS NULL AND published_at IS NOT NULL AND status != 'withdrawn' RETURNING company, role`,
    )
    .bind(now, slug)
    .first<{ company: string; role: string }>();
  if (!claimed) return "already";
  try {
    await mailer.send({ to, from: NOTIFY_FROM, ...message(claimed, slug, what) });
    return "sent";
  } catch (err) {
    await db.prepare(`UPDATE applications SET ${column} = NULL WHERE slug = ?`).bind(slug).run();
    throw err;
  }
}

export function message(app: { company: string; role: string }, slug: string, what: string) {
  return {
    subject: `${app.company}: ${what}`,
    text: [
      `Your application to ${app.company} (${app.role}) was just ${what}.`,
      "",
      `Dashboard: https://janrau.dev/admin`,
      `Review page: https://janrau.dev/admin/review/${slug}`,
      "",
      "Sent once per application by janrau.dev.",
    ].join("\n"),
  };
}
