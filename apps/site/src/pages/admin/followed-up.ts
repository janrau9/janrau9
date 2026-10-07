import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { verifyAccess } from "../../lib/access";
import { adminEmail } from "../../lib/admin-env";
import { SLUG } from "../../lib/tailored";

export const prerender = false;

/**
 * Record that Janrau followed up on an application: clears its reminder and restarts the
 * no-reply clock. Same contract as /admin/status: JSON for the island, a redirect without it.
 */
export const POST: APIRoute = async ({ request, redirect, url }) => {
  const wantsJson = (request.headers.get("accept") ?? "").includes("application/json");
  const fail = (status: number, message: string) =>
    wantsJson ? Response.json({ ok: false, message }, { status }) : new Response(message, { status });

  if (!(await adminEmail(request, verifyAccess))) return fail(403, "Your sign-in has expired. Reload the page.");
  if (request.headers.get("origin") !== url.origin) return fail(403, "Rejected: not sent from the dashboard.");

  const slug = String((await request.formData()).get("slug") ?? "");
  if (!SLUG.test(slug)) return fail(400, "Unknown application.");
  if (!env.DB) return fail(503, "The database is unavailable. Nothing was changed.");

  const now = Math.floor(Date.now() / 1000);
  let saved: { followed_up_at: number } | null;
  try {
    saved = await env.DB.prepare("UPDATE applications SET followed_up_at = ? WHERE slug = ? RETURNING followed_up_at")
      .bind(now, slug)
      .first<{ followed_up_at: number }>();
  } catch {
    return fail(503, "The database refused the change. Nothing was saved.");
  }
  if (!saved) return fail(404, "No such application.");
  return wantsJson ? Response.json({ ok: true, slug, followedUpAt: saved.followed_up_at }) : redirect("/admin", 303);
};
