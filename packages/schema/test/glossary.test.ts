import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { checkGlossary, type Glossary } from "../src/glossary.ts";
import { loadContent } from "../src/load.ts";

const content = loadContent(resolve(import.meta.dirname, "../../../content"));
const { cv } = content;

/** A copy of the real glossary with one term changed. */
function withTerm(id: string, change: Partial<Glossary["terms"][number]>): Glossary {
  return { terms: content.glossary.terms.map((t) => (t.id === id ? { ...t, ...change } : t)) };
}

describe("glossary", () => {
  test("the real glossary passes every rule", () => {
    expect(checkGlossary(content.glossary, cv)).toEqual([]);
  });

  test('"have" must cite cv.yaml', () => {
    const issues = checkGlossary(withTerm("docker", { evidence: [] }), cv);
    expect(issues.map((i) => i.message)).toContain('"docker" is "have", so it must cite cv.yaml');
  });

  test("a citation must resolve", () => {
    const issues = checkGlossary(withTerm("docker", { evidence: ["proj.gone.h1"] }), cv);
    expect(issues.map((i) => i.message)).toContain('unknown cv.yaml id "proj.gone.h1"');
  });

  test("near terms must be ones I have", () => {
    const issues = checkGlossary(withTerm("go", { near: ["rust"] }), cv);
    expect(issues.map((i) => i.message)).toContain('"rust" is "not-yet"; point at terms I have');
  });

  test("a spelling can match only one term", () => {
    const issues = checkGlossary(withTerm("rust", { aliases: ["golang"] }), cv);
    expect(issues.map((i) => i.message)).toContain('"golang" already matches "go"');
  });

  test("a language counts as evidence", () => {
    expect(content.glossary.terms.find((t) => t.id === "finnish")?.evidence).toEqual(["lang:Finnish"]);
  });
});
