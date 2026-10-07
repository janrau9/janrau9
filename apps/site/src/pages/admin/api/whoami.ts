import type { APIRoute } from "astro";
import { verifyAccess } from "../../../lib/access";
import { adminEmail } from "../../../lib/admin-env";

export const prerender = false;

/** A harmless authenticated call: `pnpm job ping` uses it to test credentials from any surface. */
export const GET: APIRoute = async ({ request }) => {
  const identity = await adminEmail(request, verifyAccess);
  if (!identity) return Response.json({ ok: false, message: "Not signed in." }, { status: 403 });
  return Response.json({ ok: true, identity });
};
