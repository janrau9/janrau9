/**
 * The dashboard's next steps: which applications need a follow-up, from what the links
 * recorded. Only "applied" applications get reminders; any other status means there is
 * an answer, or nothing was sent.
 */
const DAY = 86400;
/** About 5 working days after a person first read the page. */
export const FOLLOW_UP_AFTER_DAYS = 7;
/** Published, and no person has read it yet. */
export const UNREAD_AFTER_DAYS = 10;
/** No answer this long after publishing or the last follow-up. */
export const NO_REPLY_AFTER_DAYS = 21;

export interface FollowUpInput {
  slug: string;
  company: string;
  status: string;
  published_at: number | null;
  first_human: number | null;
  followed_up_at: number | null;
}

export interface Reminder {
  slug: string;
  company: string;
  kind: "follow-up" | "unread" | "no-reply";
  days: number;
  text: string;
}

export function reminders(rows: FollowUpInput[], now = Math.floor(Date.now() / 1000)): Reminder[] {
  const out: Reminder[] = [];
  for (const r of rows) {
    if (r.status !== "applied" || r.published_at === null) continue;
    const days = (ts: number) => Math.floor((now - ts) / DAY);
    const base = { slug: r.slug, company: r.company };
    const quiet = days(r.followed_up_at ?? r.published_at);
    if (quiet >= NO_REPLY_AFTER_DAYS)
      out.push({
        ...base,
        kind: "no-reply",
        days: quiet,
        text: `No reply ${quiet} days after ${r.followed_up_at ? "your follow-up" : "publishing"}. Set the status to no reply, or follow up once more.`,
      });
    else if (r.followed_up_at !== null) continue;
    else if (r.first_human !== null && days(r.first_human) >= FOLLOW_UP_AFTER_DAYS)
      out.push({
        ...base,
        kind: "follow-up",
        days: days(r.first_human),
        text: `A person read it ${days(r.first_human)} days ago, with no reply yet. Send the recruiter a short follow-up.`,
      });
    else if (r.first_human === null && days(r.published_at) >= UNREAD_AFTER_DAYS)
      out.push({
        ...base,
        kind: "unread",
        days: days(r.published_at),
        text: `No person has read it in ${days(r.published_at)} days. Try another channel: the recruiter on LinkedIn, or a referral.`,
      });
  }
  return out.sort((a, b) => b.days - a.days);
}
