import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { verifyAccess } from "../../../../lib/access";
import { adminEmail } from "../../../../lib/admin-env";
import { SLUG } from "../../../../lib/tailored";

export const prerender = false;

/** Attachments for application forms, downloadable from any device once signed in. */
const KINDS: Record<string, { key: string; name: string }> = {
  "cv.pdf": { key: "cvfile", name: "CV" },
  "cover-letter.pdf": { key: "letter", name: "Cover-Letter" },
};

export const GET: APIRoute = async ({ request, params }) => {
  if (!(await adminEmail(request, verifyAccess))) return new Response("Forbidden", { status: 403 });
  const slug = params.slug ?? "";
  const kind = KINDS[params.kind ?? ""];
  if (!SLUG.test(slug) || !kind) return new Response("Not found", { status: 404 });
  const pdf = await env.CV_FILES.get(`${kind.key}:${slug}`, "arrayBuffer");
  if (!pdf) return new Response("Not staged yet", { status: 404 });
  const company = slug.replace(/-[a-z0-9]{5}$/, "").replace(/(^|-)([a-z])/g, (_, d, c: string) => d + c.toUpperCase());
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Janrau-Beray-${kind.name}-${company}.pdf"`,
    },
  });
};
