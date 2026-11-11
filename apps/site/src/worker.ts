import { env as bindings } from "cloudflare:workers";
import { handle } from "@astrojs/cloudflare/handler";
import { sendDigests } from "./lib/digest";
import { sendReminders } from "./lib/reminder-mail";

/**
 * Must match the daily cron in wrangler.jsonc. Not exported: the Workers runtime treats every
 * named export of this module as a handler, and refuses to start on anything else.
 */
const DAILY = "0 6 * * *";

/**
 * The Worker: Astro answers requests; the cron triggers in wrangler.jsonc send the visit
 * digests (every 10 minutes) and the follow-up reminders (once a day, 06:00 UTC).
 */
export default {
  fetch: handle,
  async scheduled(controller: { cron: string }, _env: unknown, ctx: { waitUntil(p: Promise<unknown>): void }) {
    const { DB, NOTIFY, NOTIFY_TO } = bindings;
    if (!DB) return;
    const job = controller.cron === DAILY ? sendReminders(DB, NOTIFY, NOTIFY_TO) : sendDigests(DB, NOTIFY, NOTIFY_TO);
    ctx.waitUntil(job.catch((err) => console.error(`${controller.cron} job failed: ${err?.code ?? ""} ${err}`)));
  },
};
