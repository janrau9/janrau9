import type { Plan } from "@janrau/elevator";

/** One timed step, as the worker reports it. Times are epoch milliseconds (timeOrigin + now). */
export interface Span {
  id: string;
  name: string;
  state: "running" | "done" | "waiting" | "skipped" | "failed";
  start: number;
  end?: number;
  /** Shown after the name: "12 of 34 MB", "from cache". */
  size?: string;
  /** Shown under the bar: what this step did. */
  note?: string;
}

export type ToWorker = { type: "load"; keywordsOnly: boolean } | { type: "ask"; id: number; q: string; fit: string[] };

export type FromWorker =
  | { type: "span"; span: Span }
  | { type: "ready"; keywordsOnly: boolean }
  | { type: "answer"; id: number; q: string; plan: Plan }
  | { type: "error"; message: string };

export const now = () => performance.timeOrigin + performance.now();

/** Cache Storage name for the model and runtime; the marker says a full download finished. */
export const CACHE = "elevator-v1";
export const COMPLETE = "/elevator/.complete";
