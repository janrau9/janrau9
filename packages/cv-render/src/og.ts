import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

/**
 * Link-preview images (Open Graph, 1200×630) in seiza's night sky: what LinkedIn, email and
 * chat apps show when a janrau.dev link is pasted. Rendered at build time from SVG to PNG,
 * because most previewers accept neither SVG nor web fonts.
 */
const W = 1200;
const H = 630;
const NIGHT = {
  ground: "#0a0a11",
  ink: "#eeedf4",
  text2: "#a8a8b3",
  text3: "#7d7d89",
  line: "#33333e", // line-strong: plain --line vanishes in a thumbnail
  seal: "#f96146",
};
const fontDir = fileURLToPath(new URL("../fonts", import.meta.url));
const FONT_FILES = ["Geist-Regular.ttf", "Geist-SemiBold.ttf", "GeistMono-Regular.ttf"].map((f) => `${fontDir}/${f}`);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Deterministic randomness, so every build draws the same lattice. */
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** The kikkō field: whole hexagons, a ragged frontier on every edge, one cell washed in the seal. */
function lattice(seed: string, box: { x: number; y: number; w: number; h: number }): string {
  const edge = 30; // larger than the site's 21, so the structure reads in a small preview
  const hw = edge * Math.sqrt(3);
  const pitch = edge * 1.5;
  const rand = rng(seed);
  const rows = Math.floor(box.h / pitch);
  const cols = Math.floor(box.w / hw);
  const jitter = (n: number) => Array.from({ length: n + 2 }, () => Math.floor(rand() * 3));
  const [top, bottom, left, right] = [jitter(cols), jitter(cols), jitter(rows), jitter(rows)];
  const cells: { cx: number; cy: number }[] = [];
  for (let r = 0; r < rows; r++) {
    const cy = box.y + edge + r * pitch;
    const off = r % 2 === 0 ? hw / 2 : 0;
    for (let c = 0; c < cols; c++) {
      const cx = box.x + off + c * hw + hw / 2;
      const col = Math.min(cols, c);
      const keep =
        r >= (top[col] ?? 0) &&
        r <= rows - 1 - (bottom[col] ?? 0) &&
        c >= (left[r] ?? 0) &&
        c <= cols - 1 - (right[r] ?? 0);
      if (keep && cx + hw / 2 <= box.x + box.w && cy + edge <= box.y + box.h) cells.push({ cx, cy });
    }
  }
  const hex = ({ cx, cy }: { cx: number; cy: number }) =>
    `M${cx},${cy - edge} L${cx + hw / 2},${cy - edge / 2} L${cx + hw / 2},${cy + edge / 2} L${cx},${cy + edge} L${cx - hw / 2},${cy + edge / 2} L${cx - hw / 2},${cy - edge / 2} Z`;
  const near = (c: { cx: number; cy: number }) =>
    cells.filter((o) => Math.hypot(o.cx - c.cx, o.cy - c.cy) < hw * 1.1).length - 1;
  // A cell the frontier cut loose reads as noise, not as part of the field.
  for (let i = cells.length - 1; i >= 0; i--) if (near(cells[i] as (typeof cells)[number]) < 2) cells.splice(i, 1);
  const inner = cells.filter((c) => cells.filter((o) => Math.hypot(o.cx - c.cx, o.cy - c.cy) < hw * 1.1).length >= 7);
  const seal = inner[Math.floor(rand() * inner.length)];
  return [
    seal ? `<path d="${hex(seal)}" fill="${NIGHT.seal}" fill-opacity="0.34"/>` : "",
    `<path d="${cells.map(hex).join(" ")}" fill="none" stroke="${NIGHT.line}" stroke-width="1.5"/>`,
  ].join("");
}

/**
 * Word wrap by approximate character width, balanced: the narrowest width that needs no more
 * lines than the widest, so the last line is never a lone word.
 */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const lines = greedy(text, maxChars, maxLines);
  let best = lines;
  for (let w = maxChars - 1; w > maxChars / 2; w--) {
    const tighter = greedy(text, w, maxLines);
    if (tighter.length > lines.length || tighter.some((l) => l.endsWith("…"))) break;
    best = tighter;
  }
  return best;
}

function greedy(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if ((line ? `${line} ${word}` : word).length > maxChars && line) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]?.replace(/\s+\S*$/, "")}…`;
    return kept;
  }
  return lines;
}

/**
 * The display line. For a name with a j, the seal is the j's dot (as on the site): Geist's
 * dotless ȷ plus a vermilion dot where Geist draws its own, measured at weight 600
 * (left 0.105em, 0.135em × 0.105em, top 0.71em above the baseline).
 */
function display(text: string, x: number, baseline: number, size: number, sealJ: boolean): string {
  const at = sealJ ? text.indexOf("j") : -1;
  const shown = at < 0 ? text : `${text.slice(0, at)}ȷ${text.slice(at + 1)}`;
  const body = `<text x="${x}" y="${baseline}" font-family="Geist" font-weight="600" font-size="${size}" letter-spacing="${-0.02 * size}" fill="${NIGHT.ink}">${esc(shown)}</text>`;
  if (at !== 0) return body; // the measured dot position is for a j that starts the line
  const dot = `<rect x="${x + 0.105 * size}" y="${baseline - 0.71 * size}" width="${0.135 * size}" height="${0.105 * size}" rx="${0.02 * size}" fill="${NIGHT.seal}"/>`;
  return body + dot;
}

export interface Card {
  /** Seeds the lattice; the same card always draws the same field. */
  key: string;
  title: string;
  subtitle: string;
  footer: string;
  /** The home card: the title is the name, and the j's dot is the seal. */
  sealJ?: boolean;
}

export function renderCard(card: Card): Buffer {
  // The text column is 600 px; Geist SemiBold averages about 0.56 em per character.
  const titleSize = card.title.length > 12 ? 76 : 96;
  const titleLines = wrap(card.title, Math.floor(600 / (0.56 * titleSize)), 2);
  const title = titleLines
    .map((l, i) =>
      display(l, 80, 270 - (titleLines.length - 1 - i) * 1.1 * titleSize, titleSize, i === 0 && Boolean(card.sealJ)),
    )
    .join("");
  const sub = wrap(card.subtitle, 36, 3)
    .map(
      (l, i) =>
        `<text x="80" y="${348 + i * 46}" font-family="Geist" font-size="34" fill="${NIGHT.text2}">${esc(l)}</text>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${NIGHT.ground}"/>
  ${lattice(card.key, { x: 720, y: 40, w: 440, h: 550 })}
  ${title}
  ${sub}
  <text x="80" y="566" font-family="Geist Mono" font-size="24" letter-spacing="1" fill="${NIGHT.text3}">${esc(card.footer)}</text>
</svg>`;
  return new Resvg(svg, {
    fitTo: { mode: "original" },
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: "Geist" },
  })
    .render()
    .asPng();
}
