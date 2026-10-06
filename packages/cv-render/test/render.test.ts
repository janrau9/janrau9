import { resolve } from "node:path";
import { loadContent } from "@janrau/schema";
import { extractText } from "unpdf";
import { describe, expect, test } from "vitest";
import { buildCvDocument } from "../src/document.ts";
import { renderPdf } from "../src/pdf.ts";
import { renderReadme } from "../src/readme.ts";

const content = loadContent(resolve(import.meta.dirname, "../../../content"));
const SITE = "https://janrau.dev";

/** Collapse whitespace so line wrapping in the PDF doesn't break substring checks. */
const flat = (s: string) => s.replace(/\s+/g, " ");

describe("PDF CV", async () => {
  const doc = buildCvDocument(content, { site: SITE });
  const { text } = await extractText(new Uint8Array(renderPdf(doc)), { mergePages: true });
  const pdf = flat(text);

  test("contains the name, the headline and every included highlight", () => {
    expect(pdf).toContain(doc.name);
    expect(pdf).toContain(doc.headline);
    for (const e of doc.experience) for (const h of e.highlights) expect(pdf).toContain(flat(h));
    for (const p of doc.projects) for (const h of p.highlights) expect(pdf).toContain(flat(h));
  });

  // Applicant tracking systems read top to bottom; a two-column layout would interleave sections.
  test("reads in document order", () => {
    const order = [
      doc.name,
      "Experience",
      doc.experience[0]!.role,
      "Projects",
      doc.projects[0]!.name,
      "Education",
      "Skills",
    ];
    const positions = order.map((s) => pdf.indexOf(s));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test("the general PDF has no phone number", () => {
    expect(doc.contact.phone).toBeUndefined();
    expect(pdf).not.toMatch(/\+358/);
  });

  test("a phone number, when given, is printed", () => {
    const withPhone = buildCvDocument(content, { site: SITE, phone: "+358 00 000 0000" });
    expect(withPhone.contact.phone).toBe("+358 00 000 0000");
  });

  test("featured projects come first", () => {
    const featured = content.cv.projects.filter((p) => p.featured).map((p) => p.name);
    expect(doc.projects.slice(0, featured.length).map((p) => p.name)).toEqual(featured);
  });
});

describe("README", () => {
  const readme = renderReadme(content, SITE);

  test("is marked as generated", () => {
    expect(readme.split("\n")[0]).toMatch(/Generated from content\/cv\.yaml/);
  });

  test("links only case studies that are published", () => {
    for (const w of content.work) {
      const link = `${SITE}/work/${w.slug}`;
      if (w.frontmatter.draft) expect(readme).not.toContain(link);
      else expect(readme).toContain(link);
    }
  });

  test("carries the Seiza author line", () => {
    expect(readme).toContain("Set in seiza · a design language by");
  });
});

describe("tailored PDF", async () => {
  const { Variant } = await import("@janrau/schema/variant");
  const { buildTailoredDocument } = await import("../src/document.ts");
  const { readFileSync } = await import("node:fs");
  const fixture = resolve(import.meta.dirname, "../../../apps/site/test/fixtures/acme.variant.json");
  const variant = Variant.parse(JSON.parse(readFileSync(fixture, "utf8")));
  const doc = buildTailoredDocument(content, variant, { site: SITE, phone: "+358 00 000 0000" });
  const { text } = await extractText(new Uint8Array(renderPdf(doc)), { mergePages: true });
  const pdf = flat(text);

  test("puts the variant's projects first", () => {
    expect(doc.projects.slice(0, 3).map((p) => p.name)).toEqual(["Slash", "synchd", "kiln"]);
  });

  test("prints the cover note under the company's name", () => {
    expect(pdf).toContain("Why Acme Events");
    for (const p of doc.coverNote?.paragraphs ?? []) expect(pdf).toContain(flat(p));
  });

  test("prints the phone number, because the link is private", () => {
    expect(pdf).toContain("+358 00 000 0000");
  });
});
