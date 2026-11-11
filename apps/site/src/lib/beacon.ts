import { termIds } from "./elevator-terms";
import { CASE, type ClientEvent, MAX_VISIT_SECONDS } from "./events";

/** What an event was about, validated: a case study slug, known term ids, or whole seconds. */
export function eventDetail(type: ClientEvent, body: unknown): string | null {
  const b = (body ?? {}) as { case?: unknown; seconds?: unknown };
  if (type === "case_click")
    return typeof b.case === "string" && CASE.test(b.case) && b.case.length <= 40 ? b.case : null;
  if (type === "elevator") return termIds(body).join(" ") || null;
  if (type === "visit_end") {
    const n = typeof b.seconds === "number" ? Math.round(b.seconds) : Number.NaN;
    return n >= 0 && n <= MAX_VISIT_SECONDS ? String(n) : null;
  }
  return null;
}
