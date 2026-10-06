import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadContent } from "@janrau/schema";
import { buildCvDocument } from "./document.ts";
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
