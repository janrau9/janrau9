import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { SLUG } from "../../../lib/tailored";

export const prerender = false;

/** The tailored PDF for one application, stored in KV when the variant was published. */
export const GET: APIRoute = async ({ params, redirect }) => {
  const slug = params.slug ?? "";
  if (!SLUG.test(slug)) return new Response("Not found", { status: 404 });
  let pdf: ArrayBuffer | null = null;
  try {
    pdf = await env.CV_FILES.get(`cv:${slug}`, "arrayBuffer");
  } catch {
    // KV unavailable: the general CV is a fine substitute.
    return redirect("/janrau-beray-cv.pdf", 302);
  }
  if (!pdf) return new Response("Not found", { status: 404 });
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="Janrau-Beray-CV.pdf"',
    },
  });
};
