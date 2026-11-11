import { loadApplications } from "./admin-data";
import { type Reminder, reminders } from "./followup";
import { type Mailer, NOTIFY_FROM } from "./notify";
import type { Db } from "./tailored";

/**
 * The dashboard's reminders, by email: each one once per basis (publishing, or the last
 * follow-up), so marking a follow-up starts its clock again and a later reminder can come.
 */
export async function sendReminders(
  db: Db,
  mailer: Mailer | undefined,
  to: string | undefined,
  options: { now?: number; dryRun?: boolean } = {},
): Promise<{ subject: string; text: string } | null> {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const rows = await loadApplications(db);
  const basis = new Map(rows.map((r) => [r.slug, r.followed_up_at ?? r.published_at ?? 0]));
  const fresh: Reminder[] = [];
  for (const r of reminders(rows, now)) {
    const b = basis.get(r.slug) ?? 0;
    if (options.dryRun) {
      const sent = await db
        .prepare("SELECT 1 AS hit FROM reminder_emails WHERE slug = ? AND kind = ? AND basis = ?")
        .bind(r.slug, r.kind, b)
        .first<{ hit: number }>();
      if (!sent) fresh.push(r);
      continue;
    }
    const claimed = await db
      .prepare(
        "INSERT INTO reminder_emails (slug, kind, basis, sent_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING slug",
      )
      .bind(r.slug, r.kind, b, now)
      .first<{ slug: string }>();
    if (claimed) fresh.push(r);
  }
  if (fresh.length === 0) return null;
  const mail = reminderMail(fresh);
  if (options.dryRun || !mailer || !to) return mail;
  try {
    await mailer.send({ to, from: NOTIFY_FROM, ...mail });
  } catch (err) {
    for (const r of fresh)
      await db
        .prepare("DELETE FROM reminder_emails WHERE slug = ? AND kind = ? AND basis = ?")
        .bind(r.slug, r.kind, basis.get(r.slug) ?? 0)
        .run();
    throw err;
  }
  return mail;
}

export function reminderMail(items: Reminder[]): { subject: string; text: string } {
  const n = items.length;
  return {
    subject: n === 1 ? `Follow-up: ${items[0]?.company}` : `Follow-ups: ${n} applications`,
    text: [
      ...items.flatMap((r) => [`${r.company}: ${r.text}`, `  https://janrau.dev/admin/review/${r.slug}`, ""]),
      "Mark a follow-up or change the status on the dashboard: https://janrau.dev/admin",
      "",
      "Each reminder is sent once; marking a follow-up starts its clock again.",
    ].join("\n"),
  };
}
