import { z } from "zod";
import { ProjectStatus } from "./cv.ts";

/** Frontmatter of a case study in content/work/*.md. */
export const WorkFrontmatter = z.strictObject({
  id: z.string(),
  title: z.string().min(1),
  subtitle: z.string().min(5).max(120),
  status: ProjectStatus,
  statusNote: z.string().min(5),
  period: z.string().regex(/^\d{4}-\d{2} – (\d{4}-\d{2}|present)$/, "use '2026-07 – 2026-09' or '2026-06 – present'"),
  role: z.string().min(5),
  stack: z.array(z.string()).min(1),
  url: z.url().optional(),
  repo: z.union([z.literal("private"), z.url()]),
  featured: z.boolean().optional(),
  draft: z.boolean(),
});

export type WorkFrontmatter = z.infer<typeof WorkFrontmatter>;

export interface WorkFile {
  file: string;
  frontmatter: unknown;
  body: string;
}
