import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { stringify } from "yaml";
import { validateContentDir } from "../src/load.ts";
import { validateCv, validateWork } from "../src/validate.ts";
import type { WorkFile } from "../src/work.ts";

const CONTENT = resolve(import.meta.dirname, "../../../content");

/** The smallest CV that passes every rule. Each test breaks exactly one thing. */
function minimalCv() {
  const project = (n: number, featured: boolean) => ({
    id: `proj.p${n}`,
    name: `Project ${n}`,
    status: "live",
    summary: "A project that exists only in tests.",
    repo: "private",
    stack: ["typescript"],
    featured,
    highlights: [{ id: `proj.p${n}.h1`, text: "Did one verifiable thing.", tags: ["backend"] }],
  });
  return {
    person: {
      name: "Test Person",
      location: "Vantaa, Finland",
      workRights: "Eligible to work in Finland",
      availability: "14 days' notice",
      workPreferences: { remote: true, hybrid: true, relocation: false },
      languages: [{ name: "English", level: "professional" }],
      links: {
        email: "test@example.com",
        github: "https://github.com/example",
        linkedin: "https://www.linkedin.com/in/example",
      },
      about: "A short paragraph about the person.",
      aiPractice: "A short paragraph about how they use AI.",
    },
    headlines: [{ id: "hl.default", text: "Software Engineer" }],
    experience: [
      {
        id: "exp.job",
        org: "Company",
        role: "Developer",
        location: "Finland",
        start: "2025-08",
        end: null,
        highlights: [{ id: "exp.job.h1", text: "Built a thing that works.", tags: ["backend"], projects: ["proj.p1"] }],
      },
    ],
    education: [{ id: "edu.school", org: "School", programme: "Programme", start: "2023-10", end: "2025-05" }],
    projects: [project(1, true), project(2, true), project(3, true), project(4, false)],
    skills: [{ id: "skill.ts", name: "TypeScript", tags: ["frontend"] }],
  };
}

const messages = (raw: unknown) => validateCv(raw).issues.map((i) => `${i.path}: ${i.message}`);

describe("cv.yaml", () => {
  test("the minimal CV is valid", () => {
    expect(messages(minimalCv())).toEqual([]);
  });

  test("rejects a tag outside the vocabulary", () => {
    const cv = minimalCv();
    (cv.skills[0] as { tags: string[] }).tags = ["frontned"];
    expect(messages(cv).join()).toMatch(/skills\[0\]\.tags\[0\]/);
  });

  test("rejects dates that are not YYYY-MM", () => {
    const cv = minimalCv();
    (cv.experience[0] as { start: string }).start = "Aug 2025";
    expect(messages(cv).join()).toMatch(/experience\[0\]\.start: use YYYY-MM/);
  });

  test("rejects unknown keys, which catch typos and YAML quoting mistakes", () => {
    const cv = minimalCv();
    Object.assign(cv.skills[0] as object, { "PowerSync)": null });
    expect(messages(cv).join()).toMatch(/Unrecognized key/);
  });

  test("rejects duplicate IDs anywhere in the file", () => {
    const cv = minimalCv();
    cv.skills.push({ id: "skill.ts", name: "Again", tags: ["frontend"] });
    expect(messages(cv).join()).toMatch(/duplicate id "skill\.ts"/);
  });

  test("rejects references to projects that don't exist", () => {
    const cv = minimalCv();
    cv.experience[0]!.highlights[0]!.projects = ["proj.ghost"];
    expect(messages(cv).join()).toMatch(/unknown project "proj\.ghost"/);
  });

  test("rejects highlight IDs that don't belong to their parent", () => {
    const cv = minimalCv();
    cv.projects[0]!.highlights[0]!.id = "proj.p2.h9";
    expect(messages(cv).join()).toMatch(/must start with "proj\.p1\.h"/);
  });

  test("requires exactly three featured projects", () => {
    const cv = minimalCv();
    cv.projects[3]!.featured = true;
    expect(messages(cv).join()).toMatch(/exactly 3 projects must be featured; found 4/);
  });

  test("rejects a job that ends before it starts", () => {
    const cv = minimalCv();
    (cv.experience[0] as { end: string | null }).end = "2024-01";
    expect(messages(cv).join()).toMatch(/ends before it starts/);
  });
});

describe("case studies", () => {
  const cv = validateCv(minimalCv()).cv!;
  const study = (id: string, overrides: object = {}, body = "## The problem\n\nText.\n"): WorkFile => ({
    file: `${id}.md`,
    frontmatter: {
      id,
      title: "Title",
      subtitle: "A subtitle that says what it is",
      status: "live",
      statusNote: "Used for real.",
      period: "2026-07 – present",
      role: "Solo.",
      stack: ["TypeScript"],
      repo: "private",
      featured: true,
      draft: false,
      ...overrides,
    },
    body,
  });
  const featured = [study("proj.p1"), study("proj.p2"), study("proj.p3")];

  test("valid case studies pass", () => {
    expect(validateWork(featured, cv)).toEqual([]);
  });

  test("a featured project without a case study fails", () => {
    expect(validateWork(featured.slice(0, 2), cv).map((i) => i.message)).toContain(
      "featured project has no case study",
    );
  });

  test("a case study for an unknown project fails", () => {
    const issues = validateWork([...featured, study("proj.ghost", { featured: false })], cv);
    expect(issues.map((i) => i.message).join()).toMatch(/unknown project "proj\.ghost"/);
  });

  test("status must agree with cv.yaml", () => {
    const issues = validateWork([study("proj.p1", { status: "beta" }), ...featured.slice(1)], cv);
    expect(issues.map((i) => i.message).join()).toMatch(/disagrees with cv\.yaml/);
  });

  test("a published case study may not contain TODO", () => {
    const issues = validateWork([study("proj.p1", {}, "## Outcome\n\nTODO: numbers\n"), ...featured.slice(1)], cv);
    expect(issues.map((i) => i.message).join()).toMatch(/still contains TODO/);
  });

  test("a draft may contain TODO", () => {
    const issues = validateWork([study("proj.p1", { draft: true }, "## Outcome\n\nTODO\n"), ...featured.slice(1)], cv);
    expect(issues).toEqual([]);
  });
});

describe("the real content", () => {
  test("passes every rule", () => {
    expect(validateContentDir(CONTENT)).toEqual([]);
  });
});

describe("the CLI that CI runs", () => {
  const cli = resolve(import.meta.dirname, "../src/cli.ts");
  const tsx = resolve(import.meta.dirname, "../node_modules/.bin/tsx");
  const run = (dir: string) => {
    try {
      execFileSync(tsx, [cli, "validate", dir], { encoding: "utf8", stdio: "pipe" });
      return 0;
    } catch (err) {
      return (err as { status: number }).status;
    }
  };

  test("exits 0 on the real content", () => {
    expect(run(CONTENT)).toBe(0);
  });

  test("exits 1 when cv.yaml is invalid", () => {
    const dir = mkdtempSync(join(tmpdir(), "content-"));
    cpSync(CONTENT, dir, { recursive: true });
    const broken = readFileSync(join(dir, "cv.yaml"), "utf8").replace("start: 2025-08", "start: August 2025");
    writeFileSync(join(dir, "cv.yaml"), broken);
    expect(run(dir)).toBe(1);
  });

  test("exits 1 when cv.yaml is not valid YAML", () => {
    const dir = mkdtempSync(join(tmpdir(), "content-"));
    cpSync(CONTENT, dir, { recursive: true });
    writeFileSync(join(dir, "cv.yaml"), `${stringify(minimalCv())}\n  bad: [indent\n`);
    expect(run(dir)).toBe(1);
  });
});
