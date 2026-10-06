import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { verifyAccess } from "../../../lib/access";
import { adminEmail } from "../../../lib/admin-env";
import { unpublish } from "../../../lib/staging";
import { SLUG } from "../../../lib/tailored";

export const prerender = false;

/** Take a public link offline. Reversible: publishing again restores the same address. */
export const POST: APIRoute = async ({ request }) => {
  if (!(await adminEmail(request, verifyAccess)))
    return Response.json({ ok: false, message: "Not signed in." }, { status: 403 });
  if (!(request.headers.get("content-type") ?? "").includes("application/json"))
    return Response.json({ ok: false, message: "Send JSON." }, { status: 415 });
  const { slug } = (await request.json().catch(() => ({}))) as { slug?: string };
  if (!slug || !SLUG.test(slug) || !env.DB)
    return Response.json({ ok: false, message: "Unknown application." }, { status: 400 });
  if (!(await unpublish(env.DB, slug)))
    return Response.json({ ok: false, message: "No such application." }, { status: 404 });
  return Response.json({ ok: true, slug });
};
