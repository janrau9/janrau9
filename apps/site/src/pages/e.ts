import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { CLIENT_EVENTS, type ClientEvent, recordEvent } from "../lib/events";
import { SLUG } from "../lib/tailored";

export const prerender = false;

const isClientEvent = (t: unknown): t is ClientEvent => CLIENT_EVENTS.includes(t as ClientEvent);

/**
 * Beacon endpoint for tailored pages. Accepts {slug, type} as text (navigator.sendBeacon),
 * stores what happened and when, nothing about who. Always answers 204, so a bad request
 * teaches a prober nothing.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = JSON.parse((await request.text()).slice(0, 512));
  } catch {
    return new Response(null, { status: 204 });
  }
  const { slug, type } = (body ?? {}) as { slug?: unknown; type?: unknown };
  if (typeof slug === "string" && SLUG.test(slug) && isClientEvent(type) && env.DB) {
    const write = recordEvent(env.DB, slug, type).catch((err) => console.error(`event write failed: ${err}`));
    locals.cfContext?.waitUntil(write);
  }
  return new Response(null, { status: 204 });
};
