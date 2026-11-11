import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { eventDetail } from "../lib/beacon";
import { CLIENT_EVENTS, type ClientEvent, isOwnerVisit, readerKey, recordEvent, VISIT } from "../lib/events";
import { isNotifyEvent, notifyFirst } from "../lib/notify";
import { SLUG } from "../lib/tailored";

export const prerender = false;

const isClientEvent = (t: unknown): t is ClientEvent => CLIENT_EVENTS.includes(t as ClientEvent);

/**
 * Beacon endpoint for tailored pages. Accepts {slug, type, visit?, case?, terms?, seconds?}
 * as text (navigator.sendBeacon), stores what happened and when, nothing about who. Always
 * answers 204, so a bad request teaches a prober nothing.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = JSON.parse((await request.text()).slice(0, 512));
  } catch {
    return new Response(null, { status: 204 });
  }
  const { slug, type, visit } = (body ?? {}) as { slug?: unknown; type?: unknown; visit?: unknown };
  if (typeof slug === "string" && SLUG.test(slug) && isClientEvent(type) && env.DB && !isOwnerVisit(request)) {
    const db = env.DB;
    const detail = eventDetail(type, body);
    // A visit_end without its seconds says nothing.
    if (type === "visit_end" && detail === null) return new Response(null, { status: 204 });
    const cf = (request as { cf?: { asn?: number } }).cf;
    const write = (async () =>
      recordEvent(db, slug, type, undefined, undefined, {
        visit: typeof visit === "string" && VISIT.test(visit) ? visit : null,
        detail,
        reader: type === "human" ? await readerKey(slug, cf?.asn, request.headers.get("user-agent")) : null,
      }))().catch((err) => console.error(`event write failed: ${err}`));
    locals.cfContext?.waitUntil(write);
    // The first person-like read and the first CV download email Janrau, once per link.
    if (isNotifyEvent(type) && env.NOTIFY && env.NOTIFY_TO) {
      const mail = notifyFirst(db, env.NOTIFY, env.NOTIFY_TO, slug, type).catch((err) =>
        console.error(`notification failed: ${err?.code ?? ""} ${err}`),
      );
      locals.cfContext?.waitUntil(mail);
    }
  }
  return new Response(null, { status: 204 });
};
