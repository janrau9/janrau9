import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { commentMail, parseComment, sendComment, storeComment } from "../lib/comments";
import { SLUG } from "../lib/tailored";

export const prerender = false;

/**
 * A question or comment from a tailored page. The page posts JSON and shows the answer in
 * place; without JavaScript the form posts here and is sent back to the page. Answers say
 * plainly whether the message arrived, so a reader never wonders.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const isJson = (request.headers.get("content-type") ?? "").includes("application/json");
  let fields: Record<string, unknown> = {};
  try {
    fields = isJson
      ? ((await request.json()) as Record<string, unknown>)
      : Object.fromEntries((await request.formData()).entries());
  } catch {
    // An unreadable body is an empty message.
  }
  const slug = typeof fields.slug === "string" && SLUG.test(fields.slug) ? fields.slug : null;
  const answer = (ok: boolean, message: string, status = ok ? 200 : 400) =>
    isJson
      ? Response.json({ ok, message }, { status })
      : slug
        ? // Not Response.redirect: its headers are immutable, and Astro adds its own.
          new Response(null, {
            status: 303,
            headers: { location: `/for/${slug}?comment=${ok ? "sent" : "failed"}#comment` },
          })
        : new Response(message, { status });

  const parsed = parseComment(fields);
  if (!slug) return answer(false, "This page can't take comments.");
  // A honeypot hit is told it worked, so the bot learns nothing.
  if (!parsed.ok && parsed.reason === "bot") return answer(true, "Sent. Thank you.");
  if (!parsed.ok)
    return answer(false, parsed.reason === "empty" ? "Write a message first." : "That's too long to send. Shorten it.");
  if (!env.DB) return answer(false, "Comments are unavailable right now. Email me instead.", 503);

  let app: { company: string; role: string } | null;
  try {
    app = await storeComment(env.DB, slug, parsed.comment);
  } catch (err) {
    console.error(`comment write failed: ${err}`);
    return answer(false, "Your message didn't save. Try again, or email me instead.", 503);
  }
  if (!app) return answer(false, "This page isn't taking comments now. Email me instead.", 429);
  if (env.NOTIFY && env.NOTIFY_TO)
    locals.cfContext?.waitUntil(
      sendComment(env.NOTIFY, env.NOTIFY_TO, commentMail(app, slug, parsed.comment)).catch((err) =>
        console.error(`comment email failed: ${err?.code ?? ""} ${err}`),
      ),
    );
  return answer(true, "Sent. Thank you: it went straight to my inbox.");
};
