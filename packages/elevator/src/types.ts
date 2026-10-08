/** What elevator mode ships to the browser: public/elevator/index.json plus vectors.bin. */

export type PassageKind = "experience" | "project" | "highlight" | "decision" | "section";

export interface Passage {
  /** cv.yaml id for CV items; `work:<slug>#<anchor>:<n>` or `adr:<n>:<n>` for prose. */
  id: string;
  kind: PassageKind;
  /** The quoted words. Never rewritten. */
  text: string;
  /** Where it comes from: a project name, an employer, a case study, a decision record. */
  source: string;
  /** The project this belongs to, for the project-card rule. */
  project?: string;
  /** A page to read more: a case study, or the heading inside one. */
  link?: string;
  /** Section heading, for case-study and ADR passages. */
  heading?: string;
  /** Jobs: years and role, for the timeline rule. */
  when?: string;
  role?: string;
  /** Decisions: the three parts, for the decision rule. */
  chose?: string;
  over?: string;
  because?: string;
  /** Projects: shown on a project card. */
  status?: string;
  stack?: string[];
  /** Words that match by keyword besides the text: tags, stack. */
  keywords?: string[];
}

export type TermStatus = "have" | "adjacent" | "not-yet";

export interface IndexTerm {
  id: string;
  label: string;
  aliases: string[];
  status: TermStatus;
  /** Passage ids this term vouches for: its evidence, or for others the close work. */
  evidence: string[];
  near: string[];
  related: string[];
  /** Evidence that is not a passage: skill names, languages. Shown as one line. */
  listed: string[];
}

/** A curated answer from content/questions.yaml, with its citations resolved to passage ids. */
export interface IndexQuestion {
  id: string;
  question: string;
  answer: "quotes" | "words" | "conversation";
  words?: string;
  passages: string[];
  /** How many rows it has in vectors.bin: the question, then each phrasing. */
  rows: number;
}

export interface ModelFile {
  /** Path under the model folder, as Transformers.js requests it. */
  path: string;
  /** Chunk paths, in order; a file over the 25 MiB static-asset limit is split. */
  parts: string[];
  bytes: number;
}

export interface ElevatorIndex {
  version: string;
  model: { id: string; dims: number; dtype: "q8"; queryPrefix: string; files: ModelFile[] };
  runtime: { files: { path: string; bytes: number }[] };
  passages: Passage[];
  terms: IndexTerm[];
  questions: IndexQuestion[];
  /** Where "let's talk" points: the email in cv.yaml. */
  contact: string;
  /** vectors.bin layout: passages, terms, then question rows, each `dims` int8 values, then one float32 scale per row. */
  vectors: { rows: number; bytes: number };
}
