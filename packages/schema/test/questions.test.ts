import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { loadContent } from "../src/load.ts";
import { checkQuestions, type Questions } from "../src/questions.ts";

const content = loadContent(resolve(import.meta.dirname, "../../../content"));
const { cv } = content;

/** A copy of the real questions with one changed. */
function withQuestion(id: string, change: Partial<Questions["questions"][number]>): Questions {
  return { questions: content.questions.questions.map((q) => (q.id === id ? { ...q, ...change } : q)) };
}
const messages = (q: Questions) => checkQuestions(q, cv).map((i) => i.message);

describe("curated questions", () => {
  test("the real questions pass every rule", () => {
    expect(checkQuestions(content.questions, cv)).toEqual([]);
  });

  test('"words" needs my words', () => {
    const { words: _, ...conflict } = content.questions.questions.find((q) => q.id === "conflict") ?? {};
    const q = { questions: content.questions.questions.map((x) => (x.id === "conflict" ? (conflict as typeof x) : x)) };
    expect(messages(q)).toContain('"conflict" answers in my words, so it needs words');
  });

  test("a cv.yaml citation must resolve; a prose citation names a heading and opening words", () => {
    expect(messages(withQuestion("proud", { cite: ["proj.gone.h1"] }))).toContain('unknown cv.yaml id "proj.gone.h1"');
    expect(messages(withQuestion("proud", { cite: ["work:slash#outcome › Real use"] }))).toEqual([]);
  });

  test("a conversation cites nothing", () => {
    expect(messages(withQuestion("salary", { cite: ["person.about"] }))).toContain(
      '"salary" is a conversation; it cites nothing',
    );
  });
});
