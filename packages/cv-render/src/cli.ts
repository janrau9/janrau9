import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadContent } from "@janrau/schema";
import { buildCvDocument } from "./document.ts";
import { renderCard } from "./og.ts";
import { renderPdf } from "./pdf.ts";
import { renderReadme } from "./readme.ts";

const SITE = "https://janrau.dev";
const root = resolve(import.meta.dirname, "../../..");

const content = loadContent(resolve(root, "content"));
const write = (path: string, data: string | Buffer) => {
  const out = resolve(root, path);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, data);
  console.log(`wrote ${path}`);
};

const target = process.argv[2] ?? "all";
if (target === "pdf" || target === "all") {
  // The general PDF is public on the site, so it carries no phone number.
  // Tailored PDFs behind unguessable links will add CV_PHONE (phase 2).
  const doc = buildCvDocument(content, { site: SITE });
  write("apps/site/public/janrau-beray-cv.pdf", renderPdf(doc));
}
if (target === "readme" || target === "all") write("README.md", renderReadme(content, SITE));
if (target === "og" || target === "all") {
  // Link-preview images: one for the site, one per case study.
  const headline = content.cv.headlines.find((h) => h.id === "hl.default")?.text ?? "";
  write(
    "apps/site/public/og/home.png",
    renderCard({
      key: "home",
      title: content.cv.person.name.toLowerCase(),
      subtitle: headline,
      footer: "janrau.dev",
      sealJ: true,
    }),
  );
  // Drafts get no image: a public file would leak their titles.
  for (const w of content.work.filter((w) => !w.frontmatter.draft))
    write(
      `apps/site/public/og/work-${w.slug}.png`,
      renderCard({
        key: w.slug,
        title: w.frontmatter.title,
        subtitle: w.frontmatter.subtitle,
        footer: `janrau.dev/work/${w.slug} · case study`,
      }),
    );
}
if (target === "site-data" || target === "all") {
  // Tailored pages render on the Worker, which can't read content/ from disk: bundle what they need.
  const work = content.work.map((w) => ({
    slug: w.slug,
    id: w.frontmatter.id,
    draft: w.frontmatter.draft,
    frontmatter: w.frontmatter,
  }));
  // Elevator mode's counter accepts only these term ids, and the dashboard shows their labels.
  const glossary = content.glossary.terms.map(({ id, label, status }) => ({ id, label, status }));
  write("apps/site/src/generated/site-data.json", `${JSON.stringify({ cv: content.cv, work, glossary })}\n`);
}
