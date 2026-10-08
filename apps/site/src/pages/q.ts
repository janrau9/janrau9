import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { questionId, recordTerms, termIds } from "../lib/elevator-terms";
import { isOwnerVisit } from "../lib/events";

export const prerender = false;

/**
 * Elevator mode's counter: which glossary terms and curated question a question matched,
 * as ids, never the question. Unknown ids are dropped. Always answers 204.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = JSON.parse((await request.text()).slice(0, 512));
  } catch {
    return new Response(null, { status: 204 });
  }
  const question = questionId(body);
  const ids = [...termIds(body), ...(question ? [question] : [])];
  if (ids.length && env.DB && !isOwnerVisit(request))
    locals.cfContext?.waitUntil(recordTerms(env.DB, ids).catch((err) => console.error(`term count failed: ${err}`)));
  return new Response(null, { status: 204 });
};
