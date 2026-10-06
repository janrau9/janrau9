import { defineMiddleware } from "astro:middleware";
import headersFile from "../public/_headers?raw";

/**
 * public/_headers covers static assets only. Responses rendered by the Worker
 * (/for/*) get the same security headers here, read from that same file so the
 * two can't drift apart.
 */
const SECURITY_HEADERS = parseGlobalHeaders(headersFile);

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  if (context.isPrerendered) return response;
  // In dev, Vite injects styles inline, which the production CSP forbids; production
  // builds use external stylesheets only (astro.config.mjs), so the CSP applies there.
  if (!import.meta.env.DEV) for (const [name, value] of SECURITY_HEADERS) response.headers.set(name, value);
  // Tailored pages are private links: never indexed, never cached by shared caches.
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
});

function parseGlobalHeaders(text: string): [string, string][] {
  const out: [string, string][] = [];
  let inGlobal = false;
  for (const line of text.split("\n")) {
    if (/^\S/.test(line)) inGlobal = line.trim() === "/*";
    else if (inGlobal && line.includes(":")) {
      const [name, ...rest] = line.trim().split(":");
      if (name) out.push([name.trim(), rest.join(":").trim()]);
    }
  }
  return out;
}
