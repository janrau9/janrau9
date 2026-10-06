import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import type { CvDocument } from "./document.ts";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Render a CV document to PDF bytes with the vendored Geist fonts. */
export function renderPdf(doc: CvDocument): Buffer {
  const compiler = NodeCompiler.create({ fontArgs: [{ fontPaths: [here("../fonts")] }] });
  return compiler.pdf({
    mainFileContent: readFileSync(here("../templates/cv.typ"), "utf8"),
    inputs: { data: JSON.stringify(doc) },
  });
}
