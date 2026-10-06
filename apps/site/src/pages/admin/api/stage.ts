import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { verifyAccess } from "../../../lib/access";
import { adminEmail } from "../../../lib/admin-env";
import { siteCv } from "../../../lib/site-cv";
import { type StageInput, stage } from "../../../lib/staging";

export const prerender = false;

/** Stage an application, unpublished. Called by `pnpm job stage` with an Access service token. */
export const POST: APIRoute = async ({ request, url }) => {
  if (!(await adminEmail(request, verifyAccess)))
    return Response.json({ ok: false, message: "Not signed in." }, { status: 403 });
  // JSON only: a cross-site form can't send it, so no CSRF.
  if (!(request.headers.get("content-type") ?? "").includes("application/json"))
    return Response.json({ ok: false, message: "Send JSON." }, { status: 415 });
  if (!env.DB) return Response.json({ ok: false, message: "The database is unavailable." }, { status: 503 });
  let input: StageInput;
  try {
    input = (await request.json()) as StageInput;
  } catch {
    return Response.json({ ok: false, message: "The body isn't valid JSON." }, { status: 400 });
  }
  const result = await stage(env.DB, env.CV_FILES, siteCv, input);
  if (!result.ok) return Response.json(result, { status: result.status });
  return Response.json({
    ...result,
    reviewUrl: `${url.origin}/admin/review/${result.slug}`,
    publicUrl: `${url.origin}/for/${result.slug}`,
  });
};
