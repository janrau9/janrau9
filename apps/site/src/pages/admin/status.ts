import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { verifyAccess } from "../../lib/access";
import { loadApplications } from "../../lib/admin-data";
import { adminEmail } from "../../lib/admin-env";
import { funnel, STATUSES, type Status } from "../../lib/events";
import { SLUG } from "../../lib/tailored";

export const prerender = false;

/**
 * Change an application's status. The dashboard's island posts with
 * Accept: application/json and gets the saved status and fresh funnel back; without
 * JavaScript, the plain form posts and is redirected back to the dashboard.
 */
export const POST: APIRoute = async ({ request, redirect, url }) => {
  const wantsJson = (request.headers.get("accept") ?? "").includes("application/json");
  const fail = (status: number, message: string) =>
    wantsJson ? Response.json({ ok: false, message }, { status }) : new Response(message, { status });

  if (!(await adminEmail(request, verifyAccess))) return fail(403, "Your sign-in has expired. Reload the page.");
  // Forms post from /admin on this origin only.
  if (request.headers.get("origin") !== url.origin) return fail(403, "Rejected: not sent from the dashboard.");

  const form = await request.formData();
  const slug = String(form.get("slug") ?? "");
  const status = String(form.get("status") ?? "");
  if (!SLUG.test(slug) || !STATUSES.includes(status as Status)) return fail(400, "Unknown application or status.");
  if (!env.DB) return fail(503, "The database is unavailable. Nothing was changed.");

  try {
    await env.DB.prepare("UPDATE applications SET status = ? WHERE slug = ?").bind(status, slug).run();
  } catch {
    return fail(503, "The database refused the change. Nothing was saved.");
  }
  if (!wantsJson) return redirect(`/admin#${slug}`, 303);

  // Read back what was stored, so the dashboard shows the database's truth, not its own guess.
  const rows = await loadApplications(env.DB);
  const saved = rows.find((r) => r.slug === slug);
  if (saved?.status !== status) return fail(500, "The change didn't stick. Reload and try again.");
  return Response.json({ ok: true, status: saved.status, funnel: funnel(rows) });
};
