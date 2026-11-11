import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { verifyAccess } from "../../../lib/access";
import { adminEmail } from "../../../lib/admin-env";
import { sendDigests } from "../../../lib/digest";
import { sendReminders } from "../../../lib/reminder-mail";

export const prerender = false;

/**
 * Run a scheduled job now: {job: "digests" | "reminders", dry?: true}. A dry run claims and
 * sends nothing, and returns the emails it would send, to check them without waiting.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!(await adminEmail(request, verifyAccess)))
    return Response.json({ ok: false, message: "Not signed in." }, { status: 403 });
  if (!env.DB) return Response.json({ ok: false, message: "The database is unavailable." }, { status: 503 });
  const { job, dry, now } = (await request.json().catch(() => ({}))) as { job?: unknown; dry?: unknown; now?: unknown };
  const options = { dryRun: dry === true, ...(typeof now === "number" ? { now } : {}) };
  if (job === "digests")
    return Response.json({ ok: true, emails: await sendDigests(env.DB, env.NOTIFY, env.NOTIFY_TO, options) });
  if (job === "reminders") {
    const mail = await sendReminders(env.DB, env.NOTIFY, env.NOTIFY_TO, options);
    return Response.json({ ok: true, emails: mail ? [mail] : [] });
  }
  return Response.json({ ok: false, message: 'Say which job: "digests" or "reminders".' }, { status: 400 });
};
