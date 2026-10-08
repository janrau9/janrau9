import { resolve } from "node:path";
import { loadContent } from "@janrau/schema";
import { beforeAll, describe, expect, test } from "vitest";
import { collect, embedder, QUERY_PREFIX } from "../src/build.ts";
import { curatedQuestions, prosePassages } from "../src/passages.ts";
import { type Block, type Plan, Planner } from "../src/plan.ts";
import { Ranker } from "../src/rank.ts";
import type { IndexQuestion, IndexTerm, Passage } from "../src/types.ts";
import { quantize, scoreMaps, Vectors } from "../src/vectors.ts";

const root = resolve(import.meta.dirname, "../../..");
const content = loadContent(resolve(root, "content"));
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);

let passages: Passage[];
let terms: IndexTerm[];
let questions: IndexQuestion[];
let floats: number[][];
let vectors: Vectors;
let planner: Planner;
let embed: (t: string) => Promise<number[]>;

beforeAll(async () => {
  const cacheDir = resolve(root, ".cache/elevator");
  ({
    passages,
    terms,
    questions,
    vectors: floats,
  } = await collect({ content, adrDir: resolve(root, "content/adr"), cacheDir }));
  const bin = quantize(floats, 384);
  vectors = new Vectors(bin.buffer as ArrayBuffer, floats.length, 384);
  planner = new Planner({ passages, terms, questions, contact: content.cv.person.links.email });
  embed = await embedder(cacheDir);
}, 300_000);

/** Ask the way the browser does: embed with the query prefix, score against int8 vectors. */
async function ask(q: string, curated = true): Promise<Plan> {
  const scores = scoreMaps(
    vectors.scores(await embed(QUERY_PREFIX + q)),
    passages.map((p) => p.id),
    terms.map((t) => t.id),
    curated ? questions : [],
  );
  return planner.plan(q, scores);
}
const find = <K extends Block["kind"]>(plan: Plan, kind: K) =>
  plan.blocks.find((b): b is Extract<Block, { kind: K }> => b.kind === kind);
const shown = (plan: Plan) =>
  plan.blocks.flatMap((b) =>
    b.kind === "card"
      ? [b.project.id, ...b.quotes.map((h) => h.passage.id)]
      : "hits" in b
        ? b.hits.map((h) => h.passage.id)
        : b.kind === "quotes"
          ? b.groups.flatMap((g) => g.hits.map((h) => h.passage.id))
          : [],
  );

describe("the index", () => {
  test("covers the CV, published case studies and decision records, never drafts", () => {
    const drafts = content.work.filter((w) => w.frontmatter.draft).map((w) => `work:${w.slug}#`);
    expect(passages.some((p) => p.id === "proj.slash.h3")).toBe(true);
    expect(passages.some((p) => p.id.startsWith("work:slash#"))).toBe(true);
    expect(passages.some((p) => p.id.startsWith("adr:001#"))).toBe(true);
    expect(passages.filter((p) => drafts.some((d) => p.id.startsWith(d)))).toEqual([]);
  });

  test("int8 vectors score within 0.01 of float", async () => {
    const q = await embed(`${QUERY_PREFIX}testing and CI`);
    const quantized = vectors.scores(q);
    const worst = Math.max(...floats.map((f, i) => Math.abs(dot(f, q) - (quantized[i] ?? 0))));
    expect(worst).toBeLessThan(0.01);
  });

  test("decision tables in case studies become decisions", () => {
    const table =
      "## Decisions\n\n| I chose | Over | Because |\n|---|---|---|\n| Zero | Polling | Live state matters more than offline writes here. |\n";
    const [p] = prosePassages(table, { prefix: "work:x", source: "X", link: (a) => `/work/x#${a}` });
    expect(p).toMatchObject({ kind: "decision", chose: "Zero", over: "Polling", link: "/work/x#decisions" });
  });
});

describe("the glossary step", () => {
  test('"go lang" says Go is not in my work yet, and shows the closest', async () => {
    const plan = await ask("go lang");
    expect(find(plan, "missing")).toEqual({ kind: "missing", term: "Go", near: ["TypeScript", "C"] });
    expect(plan.termIds).toEqual(["go"]);
  });

  test('"k8s" and "container orchestration" both mean Kubernetes', async () => {
    for (const q of ["k8s", "container orchestration"]) expect((await ask(q)).termIds).toEqual(["kubernetes"]);
  });

  // A typo the content never quotes (the case study quotes "kubernets" as an example).
  test('"kubernetse" asks "did you mean Kubernetes?" and claims no term', async () => {
    const plan = await ask("kubernetse");
    expect(find(plan, "did-you-mean")?.options).toEqual(["Kubernetes"]);
    expect(plan.termIds).toEqual([]);
  });

  test('"do you know swift?" is adjacent, with the close work', async () => {
    const plan = await ask("do you know swift?");
    expect(find(plan, "adjacent")?.near).toEqual(["React Native", "iOS"]);
  });

  test('"devops" says what it covers and leads with that evidence', async () => {
    const plan = await ask("devops");
    expect(find(plan, "covers")?.parts).toEqual(["CI/CD", "Docker", "Monitoring"]);
    expect(shown(plan).slice(0, 3)).toContain("proj.shotclock.h4");
    expect(plan.rule).not.toContain("did you mean");
  });

  test('"next.js" finds the Shorts studio dashboard', async () => {
    expect(shown(await ask("have you shipped next.js?"))).toContain("proj.shorts-studio.h4");
  });

  test('"customer facing" pins the curated answer, and ranking alone also leads with the integrations', async () => {
    expect(find(await ask("customer facing"), "curated")?.passages[0]?.id).toBe("exp.current.h1");
    const ranked = await ask("customer facing", false);
    expect(shown(ranked).slice(0, 3)).toEqual(expect.arrayContaining(["exp.current.h1", "exp.current.h2"]));
  });

  test('a near-exact spelling counts: "stakeholder" is the "stakeholders" alias', async () => {
    expect((await ask("stakeholder communication")).termIds).toContain("customer-facing");
  });

  test("a term backed only by a CV line still answers, never with the empty state", async () => {
    const plan = await ask("agile");
    expect(find(plan, "listed")).toBeDefined();
    expect(find(plan, "examples")).toBeUndefined();
  });

  test("a lead-in sentence travels with its list instead of standing alone", () => {
    const md =
      "## How\n\nOne concrete call: an agent asks who uses formatPrice.\n\n1. The CLI asks the language server for references.\n";
    const [p] = prosePassages(md, { prefix: "work:x", source: "X", link: (a) => `/work/x#${a}` });
    expect(p?.text).toBe(
      "One concrete call: an agent asks who uses formatPrice. The CLI asks the language server for references.",
    );
  });

  test("a language with a certificate is listed", async () => {
    expect(find(await ask("do you speak finnish?", false), "listed")?.names).toContain("Finnish (A2)");
    expect(find(await ask("do you speak finnish?"), "curated")?.passages.map((p) => p.text)).toEqual([
      "Languages: English (professional), Finnish (A2).",
    ]);
  });

  test('"blockchain" is named as missing, with examples to try', async () => {
    const plan = await ask("blockchain");
    expect(find(plan, "nothing")?.words).toEqual(["blockchain"]);
    expect(find(plan, "examples")).toBeDefined();
  });

  test('keywords match whole word starts: "food" never finds "dogfooding"', () => {
    const p: Passage = { id: "x", kind: "highlight", text: "A dogfooding loop, and a block of tests.", source: "X" };
    const ranker = new Ranker([p]);
    expect(ranker.mentions(p, "food")).toBe(false);
    expect(ranker.mentions(p, "blockchain")).toBe(false);
    expect(ranker.mentions(p, "testing")).toBe(true);
  });
});

describe("ranking and layout", () => {
  test("leading people finds the Texas Instruments team lead", async () => {
    const plan = await ask("leading people");
    expect(shown(plan)).toContain("exp.ti.h2");
    expect(find(plan, "timeline")).toBeDefined();
  });

  test("real-time sync leads with synchd or Slash", async () => {
    const top = shown(await ask("real-time sync between devices")).slice(0, 3);
    expect(top.some((id) => /synchd|slash/.test(id))).toBe(true);
  });

  test("AI coding agents leads with kiln", async () => {
    const top = shown(await ask("how do you work with AI coding agents?")).slice(0, 4);
    expect(top.some((id) => id.includes("kiln"))).toBe(true);
  });

  test("the best 3 lead and the rest wait behind See more", async () => {
    const plan = await ask("Python backend work");
    const more = find(plan, "more");
    expect(more?.hits.length).toBeGreaterThan(0);
    expect(shown(plan).length - (more?.hits.length ?? 0)).toBeLessThanOrEqual(3 + 5);
  });

  test("fit-table evidence ranks higher on a tailored link and says so", async () => {
    const q = "testing and CI";
    const scores = scoreMaps(
      vectors.scores(await embed(QUERY_PREFIX + q)),
      passages.map((p) => p.id),
      terms.map((t) => t.id),
    );
    const plan = planner.plan(q, scores, new Set(["proj.sisu-shift.h5"]));
    const lead = plan.blocks.flatMap((b) => (b.kind === "quotes" ? b.groups.flatMap((g) => g.hits) : []));
    expect(lead.find((h) => h.passage.id === "proj.sisu-shift.h5")?.reasons).toContain("in this application");
  });
});

describe("curated answers", () => {
  // Wordings that appear nowhere in content/questions.yaml.
  const heldOut: [string, string][] = [
    ["describe a failure and what you learned", "failure"],
    ["tell me about a mistake", "failure"],
    ["have you ever broken production", "failure"],
    ["how do you deal with conflict", "conflict"],
    ["what if you disagree with a decision", "conflict"],
    ["most difficult bug you fixed", "hard-problem"],
    ["what project are you proudest of", "proud"],
    ["give an example of leading people", "initiative"],
    ["how do you react to criticism", "feedback"],
    ["how do you ensure code quality", "quality"],
    ["introduce yourself", "yourself"],
    ["what sets you apart", "why-hire"],
    ["what are you good at", "strengths"],
    ["what are your weaknesses", "weakness"],
    ["why do you want to leave", "leaving"],
    ["why did you become a developer", "career-change"],
    ["what job do you want", "next-role"],
    ["any hobbies", "outside"],
    ["link to your github", "code"],
    ["when could you join", "notice"],
    ["pay expectations", "salary"],
    ["are you open to relocation", "location"],
    ["do you speak finnish", "languages"],
  ];
  test.each(heldOut)('"%s" pins %s', async (q, id) => {
    const plan = await ask(q);
    expect(plan.questionId).toBe(id);
    expect(plan.blocks[0]?.kind).toBe("curated");
  });

  test("every question finds its own answer", async () => {
    for (const q of content.questions.questions)
      for (const text of [q.question, ...q.phrasings])
        expect([text, (await ask(text)).questionId]).toEqual([text, q.id]);
  });

  test.each([
    "devops",
    "react",
    "go lang",
    "kubernetes in production",
    "real-time sync between devices",
    "python backend work",
    "how do you deploy",
    "testing and CI",
  ])('"%s" is left to ranking', async (q) => {
    expect((await ask(q)).questionId).toBeUndefined();
  });

  test("a conversation answer points at my email, and ranking waits behind See more", async () => {
    const plan = await ask("pay expectations");
    expect(find(plan, "curated")).toMatchObject({ answer: "conversation", contact: content.cv.person.links.email });
    expect(plan.blocks.slice(1).every((b) => b.kind === "more")).toBe(true);
  });

  test("a citation that no longer matches a passage fails the build", () => {
    const broken = {
      questions: [
        {
          id: "x",
          question: "x",
          phrasings: ["y"],
          answer: "quotes" as const,
          cite: ["work:slash#outcome › Words nobody wrote"],
        },
      ],
    };
    expect(() => curatedQuestions(broken, passages)).toThrow(/matches 0 passages/);
  });
});
