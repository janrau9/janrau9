import { parseHTML } from "linkedom";
import { htmlToText } from "./text.ts";

export interface StructuredPost {
  role?: string | undefined;
  company?: string | undefined;
  location?: string | undefined;
  remote?: boolean | undefined;
  text?: string | undefined;
}

type Node = Record<string, unknown>;

/** Find a schema.org JobPosting in a page's JSON-LD blocks, including inside @graph. */
export function readJsonLd(html: string): StructuredPost | undefined {
  const { document } = parseHTML(html);
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    const posting = findPosting(data);
    if (posting) return toStructured(posting);
  }
  return undefined;
}

function findPosting(data: unknown): Node | undefined {
  if (Array.isArray(data)) return data.map(findPosting).find(Boolean);
  if (!data || typeof data !== "object") return undefined;
  const node = data as Node;
  const type = node["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return node;
  return findPosting(node["@graph"]);
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function toStructured(p: Node): StructuredPost {
  const org = p.hiringOrganization as Node | string | undefined;
  const places = (Array.isArray(p.jobLocation) ? p.jobLocation : [p.jobLocation]).filter(Boolean) as Node[];
  const location = places
    .map((pl) => (pl.address as Node | undefined) ?? {})
    .map((a) => [str(a.addressLocality), str(a.addressCountry)].filter(Boolean).join(", "))
    .filter(Boolean)
    .join("; ");
  const description = str(p.description);
  return {
    role: str(p.title),
    company: typeof org === "string" ? str(org) : str(org?.name),
    location: location || undefined,
    remote: p.jobLocationType === "TELECOMMUTE" ? true : undefined,
    text: description ? htmlToText(description) : undefined,
  };
}
