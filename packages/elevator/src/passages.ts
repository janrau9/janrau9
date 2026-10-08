import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Content, Glossary } from "@janrau/schema";
import GithubSlugger from "github-slugger";
import { parse } from "yaml";
import type { IndexTerm, Passage } from "./types.ts";

const ADR_BASE = "https://github.com/janrau9/janrau9/blob/main/content/adr/";
/** Shorter than this, a paragraph is a fragment, not an answer. */
const MIN_CHARS = 40;

const year = (ym: string | null) => (ym ? ym.slice(0, 4) : "now");

/** Markdown to the words a reader sees: links, emphasis and code marks removed. */
export const plain = (md: string) =>
  md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|\W)[*_]([^*_]+)[*_](?=\W|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();

/** Every claim in cv.yaml, as a passage. */
export function cvPassages(content: Content): Passage[] {
  const { cv } = content;
  const studies = new Map(
    content.work.filter((w) => !w.frontmatter.draft).map((w) => [w.frontmatter.id, `/work/${w.slug}`]),
  );
  const out: Passage[] = [];
  const me = cv.person;
  const about = (id: string, text: string) => out.push({ id, kind: "highlight", text, source: "About me" });
  about("person.about", me.about);
  about("person.ai", me.aiPractice);
  about(
    "person.where",
    `Based in ${me.location}. ${me.workRights}. Open to ${[me.workPreferences.remote && "remote", me.workPreferences.hybrid && "hybrid"].filter(Boolean).join(" or ")} work${me.workPreferences.relocation ? " and relocation" : ", without relocating"}.`,
  );
  about("person.languages", `Languages: ${me.languages.map((l) => `${l.name} (${l.cefr ?? l.level})`).join(", ")}.`);
  for (const e of cv.experience)
    for (const h of e.highlights)
      out.push({
        id: h.id,
        kind: "experience",
        text: h.text,
        source: e.org,
        role: e.role,
        when: `${year(e.start)}–${year(e.end)}`,
        keywords: h.tags,
      });
  for (const p of cv.projects) {
    const link = studies.get(p.id);
    const at = link ? { link } : {};
    out.push({ id: p.id, kind: "project", text: p.summary, source: p.name, status: p.status, stack: p.stack, ...at });
    for (const h of p.highlights ?? [])
      out.push({ id: h.id, kind: "highlight", text: h.text, source: p.name, project: p.id, keywords: h.tags, ...at });
    for (const d of p.decisions ?? [])
      out.push({
        id: d.id,
        kind: "decision",
        text: `Chose ${d.chose} over ${d.over}, because ${d.because}`,
        source: p.name,
        project: p.id,
        chose: d.chose,
        over: d.over,
        because: d.because,
        keywords: d.tags,
        ...at,
      });
  }
  for (const a of cv.awards ?? [])
    out.push({
      id: a.id,
      kind: "highlight",
      text: a.text,
      source: "Award",
      keywords: a.tags,
      ...(a.project ? { project: a.project } : {}),
    });
  for (const e of cv.education)
    out.push({
      id: e.id,
      kind: "experience",
      text: e.programme,
      source: e.org,
      role: "Education",
      when: `${year(e.start)}–${year(e.end)}`,
    });
  return out;
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => plain(c));

/**
 * Prose split at `##` headings into paragraphs, list items and table rows. A table whose
 * header starts "I chose | Over | Because" becomes decisions; code blocks are skipped.
 */
export function prosePassages(
  body: string,
  meta: { prefix: string; source: string; link: (anchor: string) => string; project?: string },
): Passage[] {
  const slugger = new GithubSlugger();
  const out: Passage[] = [];
  let heading = "";
  let anchor = "";
  let n = 0;
  let inCode = false;
  let table: string[][] = [];
  let para: string[] = [];
  const base = () => ({
    source: meta.source,
    link: meta.link(anchor),
    ...(heading ? { heading } : {}),
    ...(meta.project ? { project: meta.project } : {}),
  });
  const push = (text: string) => {
    if (text.length >= MIN_CHARS) out.push({ id: `${meta.prefix}#${anchor}:${n++}`, kind: "section", text, ...base() });
  };
  const flushPara = () => {
    if (para.length) push(plain(para.join(" ")));
    para = [];
  };
  const flushTable = () => {
    const [head, , ...rows] = table;
    table = [];
    if (!head) return;
    const isDecision = /chose/i.test(head[0] ?? "") && /over/i.test(head[1] ?? "");
    for (const r of rows) {
      const [chose = "", over = "", because = ""] = r;
      if (isDecision && chose && over && because)
        out.push({
          id: `${meta.prefix}#${anchor}:${n++}`,
          kind: "decision",
          text: `Chose ${chose} over ${over}, because ${because}`,
          chose,
          over,
          because,
          ...base(),
        });
      else push(r.filter(Boolean).join(" · "));
    }
  };
  for (const line of body.split("\n")) {
    if (line.startsWith("```")) {
      flushPara();
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    if (line.trim().startsWith("|")) {
      flushPara();
      table.push(cells(line));
      continue;
    }
    if (table.length) flushTable();
    const h = /^(#{2,3}) (.+)$/.exec(line);
    if (h?.[2]) {
      flushPara();
      heading = plain(h[2]);
      anchor = slugger.slug(heading);
      continue;
    }
    const item = /^\s*(?:[-*]|\d+\.) (.+)$/.exec(line);
    if (item?.[1]) {
      flushPara();
      push(plain(item[1]));
      continue;
    }
    if (!line.trim()) flushPara();
    else para.push(line.trim());
  }
  flushPara();
  if (table.length) flushTable();
  return out;
}

/** Published case studies only: a draft's words must not reach the browser. */
export function workPassages(content: Content): Passage[] {
  return content.work
    .filter((w) => !w.frontmatter.draft)
    .flatMap((w) =>
      prosePassages(w.body, {
        prefix: `work:${w.slug}`,
        source: w.frontmatter.title,
        link: (a) => `/work/${w.slug}${a ? `#${a}` : ""}`,
        project: w.frontmatter.id,
      }),
    );
}

/** Architecture decision records in content/adr, linked on GitHub. The template is skipped. */
export function adrPassages(dir: string): Passage[] {
  return readdirSync(dir)
    .filter((f) => /^\d{3}-.+\.md$/.test(f) && !f.startsWith("000-"))
    .sort()
    .flatMap((f) => {
      const raw = readFileSync(join(dir, f), "utf8");
      const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
      const fm = (m ? parse(m[1] ?? "") : {}) as { title?: string };
      const num = f.slice(0, 3);
      return prosePassages(m?.[2] ?? raw, {
        prefix: `adr:${num}`,
        source: `Decision record ${num}: ${fm.title ?? f}`,
        link: (a) => `${ADR_BASE}${f}${a ? `#${a}` : ""}`,
      });
    });
}

/** Glossary terms as the browser needs them: evidence resolved to passages, the rest listed by name. */
export function indexTerms(glossary: Glossary, content: Content, passages: Passage[]): IndexTerm[] {
  const { cv } = content;
  const isPassage = new Set(passages.map((p) => p.id));
  const names = new Map<string, string>();
  for (const s of cv.skills) names.set(s.id, s.name);
  for (const l of cv.person.languages) names.set(`lang:${l.name}`, `${l.name}${l.cefr ? ` (${l.cefr})` : ""}`);
  for (const e of cv.experience) names.set(e.id, `${e.role}, ${e.org}`);
  const byId = new Map(glossary.terms.map((t) => [t.id, t]));
  return glossary.terms.map((t) => {
    const cited =
      t.status === "have"
        ? (t.evidence ?? [])
        : [...(t.nearEvidence ?? []), ...(t.near ?? []).flatMap((n) => (byId.get(n)?.evidence ?? []).slice(0, 2))];
    return {
      id: t.id,
      label: t.label,
      aliases: t.aliases,
      status: t.status,
      evidence: [...new Set(cited.filter((id) => isPassage.has(id)))],
      listed: [...new Set(cited.flatMap((id) => (isPassage.has(id) ? [] : (names.get(id) ?? []))))],
      near: t.near ?? [],
      related: t.related ?? [],
    };
  });
}

/** What a term's embedding is made from: its name and the ways people spell it. */
export const termText = (t: Pick<IndexTerm, "label" | "aliases">) => `${t.label}: ${t.aliases.join(", ")}`;
