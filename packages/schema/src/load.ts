import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";
import type { Cv } from "./cv.ts";
import { type Issue, validateCv, validateWork } from "./validate.ts";
import { type WorkFile, WorkFrontmatter } from "./work.ts";

export interface CaseStudy {
  /** URL slug: the file name without `.md`. */
  slug: string;
  frontmatter: WorkFrontmatter;
  body: string;
}

export interface Content {
  cv: Cv;
  work: CaseStudy[];
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/** Validate everything under a content directory. Returns every issue, not just the first. */
export function validateContentDir(dir: string): Issue[] {
  return readContentDir(dir).issues;
}

/** Load validated content for rendering. Throws with every issue listed if anything is invalid. */
export function loadContent(dir: string): Content {
  const { cv, files, issues } = readContentDir(dir);
  if (issues.length > 0 || !cv)
    throw new Error(`invalid content:\n${issues.map((i) => `  ${i.file} ${i.path}: ${i.message}`).join("\n")}`);
  const work = files.map((f) => ({
    slug: f.file.replace(/^.*\//, "").replace(/\.md$/, ""),
    frontmatter: WorkFrontmatter.parse(f.frontmatter),
    body: f.body,
  }));
  return { cv, work };
}

function readContentDir(dir: string): { cv?: Cv; files: WorkFile[]; issues: Issue[] } {
  // pnpm runs scripts inside the package; report paths from where the command was typed.
  const base = process.env.INIT_CWD ?? process.cwd();
  const rel = (p: string) => relative(base, p) || p;
  const cvPath = join(dir, "cv.yaml");

  let raw: unknown;
  try {
    raw = parse(readFileSync(cvPath, "utf8"));
  } catch (err) {
    return {
      files: [],
      issues: [{ file: rel(cvPath), path: "", message: `cannot read YAML: ${(err as Error).message}` }],
    };
  }
  const { cv, issues } = validateCv(raw, rel(cvPath));
  if (!cv) return { files: [], issues };

  const workDir = join(dir, "work");
  const files: WorkFile[] = [];
  for (const name of readdirSync(workDir)
    .filter((n) => n.endsWith(".md"))
    .sort()) {
    const path = join(workDir, name);
    const match = FRONTMATTER.exec(readFileSync(path, "utf8"));
    if (!match) {
      issues.push({ file: rel(path), path: "", message: "missing --- frontmatter --- block" });
      continue;
    }
    try {
      files.push({ file: rel(path), frontmatter: parse(match[1] ?? ""), body: match[2] ?? "" });
    } catch (err) {
      issues.push({ file: rel(path), path: "frontmatter", message: `cannot read YAML: ${(err as Error).message}` });
    }
  }
  return { cv, files, issues: [...issues, ...validateWork(files, cv)] };
}
