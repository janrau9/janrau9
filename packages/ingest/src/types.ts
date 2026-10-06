/** A job post, cleaned to text. Requirements are extracted later, by the drafting step. */
export interface JobPost {
  company: string;
  role: string;
  location?: string;
  /** The full post as plain text: what quotes are checked against. */
  text: string;
  source: {
    url?: string;
    /** Which rung of the fetch ladder produced this post. */
    step: "paste" | "ats" | "json-ld" | "readable" | "headless";
    /** The applicant tracking system, when one was detected. */
    ats?: string;
    fetchedAt: string;
  };
  /** Places where structured data and the post's own text disagree. The text wins. */
  conflicts: string[];
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
/** Renders a page in a real browser and returns its HTML. Optional: step 4 of the ladder. */
export type Renderer = (url: string) => Promise<string>;

export class NeedsPaste extends Error {
  constructor(
    message: string,
    /** What each step of the ladder found, for the user. */
    readonly attempts: string[] = [],
  ) {
    super(message);
    this.name = "NeedsPaste";
  }
}
