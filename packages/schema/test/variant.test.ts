import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { loadContent } from "../src/load.ts";
import { resolveVariant } from "../src/tailor.ts";
import { Variant, validateVariant } from "../src/variant.ts";

const { cv, work } = loadContent(resolve(import.meta.dirname, "../../../content"));
const refs = work.map((w) => ({ slug: w.slug, id: w.frontmatter.id, draft: w.frontmatter.draft }));

const POST = `Acme builds tools for event organisers. We are looking for a developer with
experience in TypeScript and React, comfortable with real-time sync. You will build
integrations with third-party APIs. Our team ships weekly.`;

function variant() {
  return {
    company: "Acme",
    role: "Software Engineer",
    headlineId: "hl.default",
    fit: [
      { requirement: "experience in TypeScript and React", evidenceIds: ["proj.slash.h2", "skill.typescript"] },
      { requirement: "integrations with third-party APIs", evidenceIds: ["exp.current.h1"] },
    ],
    projectIds: ["proj.slash", "proj.kiln", "proj.sisu-shift"],
    skillIds: ["skill.typescript", "skill.react"],
    gaps: ["Go"],
    coverNote: {
      whyRole: {
        text: "Acme builds tools for event organisers, which is the problem I solve on darts nights.",
        postQuotes: ["builds tools for event organisers"],
      },
      whyMe: {
        text: "Slash has run 4 real pub tournaments with live sync across three phones per match.",
        evidenceIds: ["proj.slash.h1"],
      },
      howIWork: {
        text: "I design the system, let agents write code, and check every change with tests.",
        evidenceIds: ["proj.kiln.h1"],
      },
    },
  };
}

const messages = (v: unknown) => validateVariant(v, cv, POST).map((i) => `${i.path}: ${i.message}`);

describe("variant validation", () => {
  test("a grounded variant passes", () => {
    expect(messages(variant())).toEqual([]);
  });

  test("a requirement must be quoted from the post", () => {
    const v = variant();
    v.fit[0]!.requirement = "10 years of Rust";
    expect(messages(v).join()).toMatch(/fit\[0\]\.requirement: must be quoted/);
  });

  test("quotes survive line breaks and capitals in the post", () => {
    const v = variant();
    v.fit[0]!.requirement = "Experience in TypeScript and React, comfortable with real-time sync";
    expect(messages(v)).toEqual([]);
  });

  test("evidence must exist in cv.yaml", () => {
    const v = variant();
    v.fit[1]!.evidenceIds = ["exp.current.h99"];
    expect(messages(v).join()).toMatch(/unknown id "exp\.current\.h99"/);
  });

  test("a company fact in the cover note must be quoted from the post", () => {
    const v = variant();
    v.coverNote.whyRole.postQuotes = ["Acme is the market leader"];
    expect(messages(v).join()).toMatch(/whyRole\.postQuotes\[0\]: must be quoted/);
  });

  test("a number in the cover note must appear in a cited item", () => {
    const v = variant();
    v.coverNote.whyMe.text = "Slash has run 40 real pub tournaments with live sync across three phones.";
    expect(messages(v).join()).toMatch(/the number "40"/);
  });

  test("banned phrases fail", () => {
    const v = variant();
    v.coverNote.howIWork.text = "I am passionate about clean code and I check every change.";
    expect(messages(v).join()).toMatch(/banned phrase "passionate"/);
  });

  test("the cover note has a word limit", () => {
    const v = variant();
    v.coverNote.whyMe.text = "word ".repeat(200);
    expect(messages(v).join()).toMatch(/words; the limit is 180/);
  });

  test("at most three projects, no duplicates", () => {
    const v = variant();
    v.projectIds = ["proj.slash", "proj.slash"];
    expect(messages(v).join()).toMatch(/lists a project twice/);
  });
});

describe("resolving a variant", () => {
  test("produces the page's content in the variant's order", () => {
    const view = resolveVariant(cv, refs, validVariant());
    expect(view.projects.map((p) => p.name)).toEqual(["Slash", "kiln", "Sisu Shift"]);
    expect(view.fit[0]?.evidence[0]?.text).toMatch(/append-only visit log/);
    expect(view.skills.slice(0, 2)).toEqual(["TypeScript", "React"]);
  });

  test("links evidence to its published case study", () => {
    const view = resolveVariant(cv, refs, validVariant());
    expect(view.fit[0]?.evidence[0]?.href).toBe("/work/slash");
  });

  test("drops IDs that no longer exist instead of failing", () => {
    const v = validVariant();
    v.fit.push({ requirement: "ships weekly", evidenceIds: ["proj.gone.h1"] });
    v.projectIds.push("proj.gone");
    const view = resolveVariant(cv, refs, v);
    expect(view.fit).toHaveLength(2);
    expect(view.projects).toHaveLength(3);
  });

  test("cited highlights come first within a job", () => {
    const v = validVariant();
    v.fit[1]!.evidenceIds = ["exp.current.h5"];
    const job = resolveVariant(cv, refs, v).experience[0];
    expect(job?.highlights[0]).toMatch(/Python\/FastAPI/);
  });
});

/** A typed, schema-checked copy of the fixture. */
const validVariant = () => Variant.parse(variant());
