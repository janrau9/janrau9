import { parseHTML } from "linkedom";

/** HTML to readable text: block elements become line breaks, list items become "- " lines. */
export function htmlToText(html: string): string {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  for (const el of document.querySelectorAll("script, style, noscript, svg")) el.remove();
  for (const li of document.querySelectorAll("li")) li.prepend(document.createTextNode("- "));
  for (const br of document.querySelectorAll("br")) br.replaceWith(document.createTextNode("\n"));
  for (const el of document.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, ul, ol, section, article, tr"))
    el.append(document.createTextNode("\n"));
  return tidy(document.body?.textContent ?? "");
}

/** Decode entities that survived (e.g. double-escaped HTML in APIs), collapse blank runs. */
export function tidy(text: string): string {
  return text
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Some APIs (Greenhouse) return HTML escaped once more (&lt;p&gt;). Unescape before parsing. */
export function unescapeHtml(s: string): string {
  if (!/&lt;\/?\w/.test(s)) return s;
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&amp;/g, "&"); // last, so "&amp;lt;" becomes the text "&lt;", not a tag
}
