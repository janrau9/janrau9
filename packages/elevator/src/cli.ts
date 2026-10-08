import { resolve } from "node:path";
import { loadContent } from "@janrau/schema";
import { buildIndex } from "./build.ts";

const root = resolve(import.meta.dirname, "../../..");
await buildIndex({
  content: loadContent(resolve(root, "content")),
  adrDir: resolve(root, "content/adr"),
  outDir: resolve(root, "apps/site/public/elevator"),
  cacheDir: resolve(root, ".cache/elevator"),
  log: console.log,
});
