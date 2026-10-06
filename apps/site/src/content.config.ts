import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";

// Astro renders the Markdown bodies. Frontmatter is validated by @janrau/schema
// (see src/lib/content.ts), so this collection carries no schema of its own.
export const collections = {
  work: defineCollection({ loader: glob({ pattern: "*.md", base: "../../content/work" }) }),
};
