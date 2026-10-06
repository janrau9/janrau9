import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { verifyAccess } from "../../lib/access";
import { accessConfig } from "../../lib/admin-env";
import { STATUSES, type Status } from "../../lib/events";
import { SLUG } from "../../lib/tailored";

export const prerender = false;

/** Change an application's status from the dashboard form. */
export const POST: APIRoute = async ({ request, redirect, url }) => {
  const email = await verifyAccess(request.headers.get("cf-access-jwt-assertion"), accessConfig());
  if (!email) return new Response("Forbidden", { status: 403 });
  // Forms post from /admin on this origin only.
  if (request.headers.get("origin") !== url.origin) return new Response("Forbidden", { status: 403 });

  const form = await request.formData();
  const slug = String(form.get("slug") ?? "");
  const status = String(form.get("status") ?? "");
  if (!SLUG.test(slug) || !STATUSES.includes(status as Status) || !env.DB)
    return new Response("Bad request", { status: 400 });
  await env.DB.prepare("UPDATE applications SET status = ? WHERE slug = ?").bind(status, slug).run();
  return redirect(`/admin#${slug}`, 303);
};
