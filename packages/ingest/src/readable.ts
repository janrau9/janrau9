import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { htmlToText } from "./text.ts";

/** The main content of an HTML page, via Mozilla's Readability (the engine behind Reader View). */
export function readMainText(html: string, url: string): { title?: string | undefined; text: string } {
  const { document } = parseHTML(html);
  // Readability resolves relative links against this.
  Object.defineProperty(document, "baseURI", { value: url });
  const article = new Readability(document as unknown as Document).parse();
  return { title: article?.title ?? undefined, text: article?.content ? htmlToText(article.content) : "" };
}

/** Bot walls and challenge pages: a fetch that "worked" but returned no job post. */
export function isChallenge(status: number, html: string): string | undefined {
  if (status === 403 || status === 429 || status === 503) return `HTTP ${status}`;
  const head = html.slice(0, 20_000).toLowerCase();
  for (const sign of [
    "just a moment...",
    "enable javascript and cookies",
    "verify you are human",
    "attention required! | cloudflare",
    "captcha",
    "access denied",
  ])
    if (head.includes(sign)) return `challenge page ("${sign}")`;
  return undefined;
}
