import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { verifyAccess } from "../../../lib/access";
import { adminEmail } from "../../../lib/admin-env";
import { NOTIFY_FROM } from "../../../lib/notify";

export const prerender = false;

/** Send one test notification, so setup can be checked without waiting for a recruiter. */
export const POST: APIRoute = async ({ request }) => {
  if (!(await adminEmail(request, verifyAccess)))
    return Response.json({ ok: false, message: "Not signed in." }, { status: 403 });
  if (!env.NOTIFY || !env.NOTIFY_TO)
    return Response.json({
      ok: false,
      message: "Notifications are off: the NOTIFY binding or NOTIFY_TO secret is missing.",
    });
  try {
    const { messageId } = await env.NOTIFY.send({
      to: env.NOTIFY_TO,
      from: NOTIFY_FROM,
      subject: "janrau.dev: test notification",
      text: "Notifications from janrau.dev reach this inbox.",
    });
    return Response.json({ ok: true, messageId });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return Response.json(
      {
        ok: false,
        code: e.code ?? null,
        message: `Cloudflare refused the send${e.code ? ` (${e.code})` : ""}: ${e.message ?? String(err)}`,
      },
      { status: 502 },
    );
  }
};
