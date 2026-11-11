import { type Mailer, NOTIFY_FROM } from "./notify";
import type { Db } from "./tailored";

/**
 * Questions and comments left on a tailored page: stored, and emailed to Janrau at once, with
 * the commenter's address as Reply-To when they leave one, so answering is one reply.
 */
export const MESSAGE_MAX = 2000;
export const CONTACT_MAX = 200;
/** Comments a link accepts per day: enough for any real reader, a ceiling for a script. */
export const PER_DAY = 20;

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

export type Comment = { message: string; contact: string | null };
export type Parsed = { ok: true; comment: Comment } | { ok: false; reason: "empty" | "too-long" | "bot" };

/** Validate what the form sent. `website` is a honeypot field people never see or fill. */
export function parseComment(fields: { message?: unknown; contact?: unknown; website?: unknown }): Parsed {
  if (typeof fields.website === "string" && fields.website.trim() !== "") return { ok: false, reason: "bot" };
  const message = typeof fields.message === "string" ? fields.message.trim() : "";
  const contact = typeof fields.contact === "string" ? fields.contact.trim() : "";
  if (!message) return { ok: false, reason: "empty" };
  if (message.length > MESSAGE_MAX || contact.length > CONTACT_MAX) return { ok: false, reason: "too-long" };
  return { ok: true, comment: { message, contact: contact || null } };
}

/** An address to reply to, if the contact is one. */
export const replyAddress = (contact: string | null) => (contact && EMAIL.test(contact) ? contact : undefined);

/**
 * Store a comment on a live link, unless the link has had PER_DAY today. Returns the
 * application it belongs to, or null when the link isn't live or is over its limit.
 */
export async function storeComment(
  db: Db,
  slug: string,
  c: Comment,
  now = Math.floor(Date.now() / 1000),
): Promise<{ company: string; role: string } | null> {
  return db
    .prepare(
      `INSERT INTO comments (slug, ts, message, contact)
       SELECT ?, ?, ?, ? WHERE EXISTS (
         SELECT 1 FROM applications WHERE slug = ? AND published_at IS NOT NULL AND status != 'withdrawn'
       ) AND (SELECT COUNT(*) FROM comments WHERE slug = ? AND ts > ?) < ?
       RETURNING (SELECT company FROM applications WHERE slug = ?) AS company,
                 (SELECT role FROM applications WHERE slug = ?) AS role`,
    )
    .bind(slug, now, c.message, c.contact, slug, slug, now - 86400, PER_DAY, slug, slug)
    .first<{ company: string; role: string }>();
}

export function commentMail(app: { company: string; role: string }, slug: string, c: Comment) {
  const reply = replyAddress(c.contact);
  return {
    subject: `${app.company}: a question or comment on your application`,
    text: [
      `Someone left this on your application to ${app.company} (${app.role}):`,
      "",
      c.message,
      "",
      c.contact
        ? reply
          ? `Contact: ${c.contact}. Reply to this email to answer them.`
          : `Contact: ${c.contact}`
        : "They left no contact, so there is no way to reply.",
      "",
      `Review page: https://janrau.dev/admin/review/${slug}`,
    ].join("\n"),
    replyTo: reply,
  };
}

/**
 * Email a comment. If Cloudflare refuses the Reply-To (unverified addresses are not
 * documented either way), send again without it: the contact is in the text regardless.
 */
export async function sendComment(mailer: Mailer, to: string, mail: ReturnType<typeof commentMail>) {
  const { replyTo, ...rest } = mail;
  try {
    await mailer.send({ to, from: NOTIFY_FROM, ...rest, ...(replyTo ? { replyTo } : {}) });
  } catch (err) {
    if (!replyTo) throw err;
    console.error(`comment email with Reply-To failed, sending without it: ${err}`);
    await mailer.send({ to, from: NOTIFY_FROM, ...rest });
  }
}
