import type { Block, Hit, Passage, Plan } from "@janrau/elevator";
import { COMPLETE, type FromWorker, now, type Span, type ToWorker } from "./protocol";

/**
 * Elevator mode on the page: the lobby (the site) fades to one input, the worker loads
 * in plain view, and each answer is laid out by rules from quoted passages. Loaded only
 * when a visitor steps in, so pages carry none of this until then.
 */

type Child = Node | string | false | null | undefined;
function h(tag: string, attrs: Record<string, string | boolean> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== false) el.setAttribute(k, v === true ? "" : v);
  for (const c of children) if (c) el.append(c);
  return el;
}
const list = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const external = (href: string) => /^https?:/.test(href);
const linkTo = (href: string, label: string) => h("a", { href }, external(href) ? `${label} ↗` : label);

const dialog = document.getElementById("elevator") as HTMLDialogElement;
const $ = <T extends HTMLElement>(sel: string) => dialog.querySelector(sel) as T;
const form = $<HTMLFormElement>(".el-ask");
const input = $<HTMLInputElement>(".el-input");
const answerEl = $<HTMLElement>(".el-answer");
const consent = $<HTMLElement>(".el-consent");
const nowEl = $<HTMLElement>(".el-now");
const spansEl = $<HTMLElement>(".el-spans");

let worker: Worker | undefined;
let state: "cold" | "asking" | "loading" | "ready" = "cold";
let pending: string | undefined;
let askId = 0;
let answered = 0;
let failed = false;
const spans = new Map<string, Span>();
const fit = [...document.querySelectorAll<HTMLElement>("[data-evidence]")].flatMap((e) => e.dataset.evidence ?? []);
const slug = document.getElementById("tailored")?.dataset.slug;
let reported = false;

// ———— the trace: every step as a timed span ————

function status(text: string) {
  nowEl.textContent = text;
}

/** The hexagons breathe while elevator mode is working: loading, or answering a question. */
function busy() {
  const working = !failed && (state === "loading" || answered < askId);
  document.documentElement.classList.toggle("el-busy", working);
}

function renderTrace() {
  const all = [...spans.values()];
  const t0 = Math.min(...all.map((s) => s.start));
  const t1 = Math.max(...all.map((s) => s.end ?? now()));
  const total = Math.max(1, t1 - t0);
  spansEl.replaceChildren(
    ...all.map((s) => {
      const end = s.end ?? now();
      const ms = Math.round(end - s.start);
      const bar = h("i");
      bar.style.setProperty("--x", `${((s.start - t0) / total) * 100}%`);
      bar.style.setProperty("--w", `${Math.max(0.5, ((end - s.start) / total) * 100)}%`);
      return h(
        "li",
        { class: "el-span", "data-state": s.state },
        h("span", { class: "el-what" }, s.name, s.size ? ` · ${s.size}` : ""),
        h(
          "span",
          { class: "el-ms" },
          s.state === "waiting" ? "waiting" : s.state === "skipped" ? "skipped" : `${ms} ms`,
        ),
        h("span", { class: "el-lane", "aria-hidden": "true" }, bar),
        s.note ? h("span", { class: "el-note" }, s.note) : null,
      );
    }),
  );
}

function onSpan(s: Span) {
  spans.set(s.id, s);
  renderTrace();
  if (s.state === "running")
    status(`${s.name === "Model" ? "Downloading the model" : s.name}${s.size ? ` · ${s.size}` : ""}`);
  if (s.state === "waiting") status("Your question is waiting for the model");
}

function localSpan(name: string, note: string) {
  const t = now();
  onSpan({ id: `c${spans.size}`, name, state: "done", start: t, end: t + 0.1, note });
}

// ———— answers: the plan's blocks become layout ————

function why(hit: Hit) {
  return h("p", { class: "el-why micro" }, hit.reasons.join(" · "));
}
function quote(hit: Hit) {
  return h("div", { class: "el-quote" }, h("p", {}, hit.passage.text), why(hit));
}
function sourceLine(p: Passage) {
  const where = p.heading ? `${p.source} · ${p.heading}` : p.source;
  return h("p", { class: "micro" }, p.link ? linkTo(p.link, where) : where);
}
function ask(q: string) {
  return h("button", { type: "button", class: "el-link", "data-ask": q }, q);
}
function choices(options: string[]) {
  const out: Child[] = [];
  options.forEach((o, i) => {
    if (i) out.push(" or ");
    out.push(ask(o));
  });
  return out;
}

function render(block: Block): HTMLElement {
  switch (block.kind) {
    case "curated":
      return h(
        "div",
        { class: "el-block el-curated" },
        h("p", { class: "micro" }, `Answering: ${block.question}`),
        block.answer === "conversation"
          ? h(
              "p",
              {},
              "I'd rather answer this in a conversation: ",
              h("a", { href: `mailto:${block.contact}` }, block.contact),
            )
          : null,
        block.words ? h("p", { class: "el-words" }, block.words) : null,
        ...block.passages.map((p) =>
          h("div", { class: "el-group" }, sourceLine(p), h("div", { class: "el-quote" }, h("p", {}, p.text))),
        ),
      );
    case "missing":
      return h(
        "div",
        { class: "el-note-block" },
        h(
          "p",
          {},
          h("strong", {}, block.term),
          ` isn't in my work yet.${block.near.length ? ` Closest: ${list(block.near)}.` : ""}`,
        ),
      );
    case "adjacent":
      return h(
        "div",
        { class: "el-note-block" },
        h("p", {}, "Not directly: ", h("strong", {}, block.term), `. Closest in my work: ${list(block.near)}.`),
      );
    case "covers":
      return h("p", { class: "micro" }, `${block.term} covers ${list(block.parts)}`);
    case "did-you-mean":
      return block.footnote
        ? h("p", { class: "small text-2" }, "Or did you mean ", ...choices(block.options), "?")
        : h("div", { class: "el-note-block" }, h("p", {}, "Did you mean ", ...choices(block.options), "?"));
    case "nothing":
      return h(
        "div",
        { class: "el-note-block" },
        h("p", {}, `Nothing in my work mentions “${block.words.join("”, “")}”.`),
      );
    case "examples":
      return h("p", { class: "text-2" }, "Try one of the floors above.");
    case "card":
      return h(
        "div",
        { class: "card el-card" },
        h(
          "div",
          { class: "el-card-head" },
          h("h3", {}, block.project.source),
          block.project.link ? linkTo(block.project.link, "case study") : null,
        ),
        h("p", { class: "text-2" }, block.project.text),
        block.project.stack ? h("p", { class: "micro" }, block.project.stack.join(" · ")) : null,
        ...block.quotes.map(quote),
      );
    case "timeline":
      return h(
        "div",
        { class: "el-block" },
        h("p", { class: "micro" }, "Where I did it"),
        ...block.hits.map((hit) =>
          h(
            "div",
            { class: "el-row" },
            h("p", { class: "micro" }, hit.passage.when ?? "", h("br"), hit.passage.role ?? ""),
            h(
              "div",
              { class: "el-quote" },
              h("p", {}, hit.passage.text),
              h("p", { class: "el-why micro" }, [hit.passage.source, ...hit.reasons].join(" · ")),
            ),
          ),
        ),
      );
    case "decisions":
      return h(
        "div",
        { class: "el-block" },
        h("p", { class: "micro" }, "Decisions"),
        ...block.hits.map((hit) =>
          h(
            "div",
            { class: "el-decision" },
            sourceLine(hit.passage),
            h(
              "dl",
              {},
              h("dt", {}, "Chose"),
              h("dd", {}, hit.passage.chose ?? ""),
              h("dt", {}, "Over"),
              h("dd", {}, hit.passage.over ?? ""),
              h("dt", {}, "Because"),
              h("dd", {}, hit.passage.because ?? ""),
            ),
            why(hit),
          ),
        ),
      );
    case "quotes":
      return h(
        "div",
        { class: "el-block" },
        h("p", { class: "micro" }, block.label),
        ...block.groups.map((g) =>
          h("div", { class: "el-group" }, ...g.hits.flatMap((hit) => [sourceLine(hit.passage), quote(hit)])),
        ),
      );
    case "more":
      return h(
        "details",
        { class: "el-more" },
        h("summary", { class: "micro" }, `See ${block.hits.length} more`),
        ...block.hits.map((hit) => h("div", { class: "el-group" }, sourceLine(hit.passage), quote(hit))),
      );
    case "listed":
      return h("p", { class: "small text-2" }, `Also on my CV: ${list(block.names)}.`);
  }
}

function show(q: string, plan: Plan) {
  answerEl.replaceChildren(...plan.blocks.map(render));
  localSpan("Compose", `rule: ${plan.rule || "none"}`);
  status(`Answered · rule: ${plan.rule || "none"}`);
  // Counted: the matched glossary term ids and curated question id only, never the question.
  navigator.sendBeacon?.(
    "/q",
    JSON.stringify({
      terms: plan.termIds.length ? plan.termIds.slice(0, 3) : ["none"],
      ...(plan.questionId ? { question: plan.questionId } : {}),
    }),
  );
  if (slug && !reported) {
    reported = true;
    navigator.sendBeacon?.("/e", JSON.stringify({ slug, type: "elevator" }));
  }
  void q;
}

// ———— the worker ————

function start(keywordsOnly: boolean) {
  state = "loading";
  status(keywordsOnly ? "Loading the index" : "Fetching the index");
  busy();
  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    if (m.type === "span") onSpan(m.span);
    else if (m.type === "ready") {
      state = "ready";
      const all = [...spans.values()];
      const secs = ((now() - Math.min(...all.map((s) => s.start))) / 1000).toFixed(1);
      status(m.keywordsOnly ? "Ready · keywords only" : `Ready in ${secs} s`);
      busy();
    } else if (m.type === "answer") {
      answered = Math.max(answered, m.id);
      busy();
      show(m.q, m.plan);
    } else {
      failed = true;
      busy();
      status(m.message);
    }
  };
  send({ type: "load", keywordsOnly });
  if (pending) {
    send({ type: "ask", id: ++askId, q: pending, fit });
    pending = undefined;
    busy();
  }
}
const send = (m: ToWorker) => worker?.postMessage(m);

async function modelCached() {
  try {
    return Boolean(await caches.match(COMPLETE));
  } catch {
    return false;
  }
}

// ———— stepping in and out ————

let opener: HTMLElement | null = null;

/** The wave's speed: constant, as a ripple's is (px per ms). */
const WAVE = 1.6;
/** Spreading: a crest's strength falls as 1/√(1 + r/233), so it is still felt at the far corner. */
const crestAt = (r: number) => 1 / Math.sqrt(1 + r / 233);
/** The lattice's cell (Lattice.astro): pointy-top, edge 21. */
const HW = 36.3731;
const PITCH = 31.5;

/** Brings a part of the room up when the arriving wave reaches it; nothing once it has landed. */
let surface: (el: HTMLElement) => void = () => {};

/**
 * The room arrives as a ripple through the lattice, by the pond's physics: the screen is
 * tiled in the lattice's own cells around where it was asked for (on the home page, the red
 * cell's centre, so the tiling continues the hero's lattice), and a front spreads at constant
 * speed. Each cell the front reaches surges, lit in proportion to the crest's strength there,
 * and settles into the room's ground; each part of the room surfaces as the front reaches it.
 * The page beyond the front stays still. Reduced motion: the room is simply there.
 */
function reveal(origin?: { x: number; y: number }) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const { x, y } = origin ?? { x: w / 2, y: h / 2 };
  const water = document.createElement("div");
  water.className = "el-water";
  water.setAttribute("aria-hidden", "true");
  const rows = Math.ceil(y / PITCH) + 1;
  const cols = Math.ceil(x / HW) + 1;
  let last: Animation | undefined;
  let lastDelay = -1;
  for (let j = -rows; j * PITCH + y < h + PITCH; j++) {
    const cy = y + j * PITCH;
    const shift = Math.abs(j) % 2 ? HW / 2 : 0;
    for (let i = -cols; i * HW + x + shift < w + HW; i++) {
      const cx = x + shift + i * HW;
      const d = Math.hypot(cx - x, cy - y);
      const cell = document.createElement("div");
      cell.className = "el-cell";
      cell.style.translate = `${cx - HW / 2}px ${cy - 21}px`;
      const lit = Math.round(crestAt(d) * 100);
      const delay = d / WAVE;
      const a = cell.animate(
        [
          {
            opacity: 0,
            transform: "scale(0.62)",
            backgroundColor: `color-mix(in oklab, var(--line-strong) ${lit}%, var(--ground))`,
          },
          { opacity: 1, transform: "scale(1.03)", offset: 0.4 },
          { opacity: 1, transform: "scale(1.03)", backgroundColor: "var(--ground)" },
        ],
        { duration: 377, delay, easing: "ease-out", fill: "both" },
      );
      if (delay > lastDelay) [last, lastDelay] = [a, delay];
      water.append(cell);
    }
  }
  dialog.classList.add("el-arriving");
  dialog.prepend(water);
  // Each part of the room surfaces when the front reaches it, including parts shown later
  // while the wave is still spreading (the phone's download question).
  const start = performance.now();
  surface = (el) => {
    const b = el.getBoundingClientRect();
    // Its farthest corner: it surfaces once the water covers all of it, never over the page.
    const dx = Math.max(Math.abs(b.left - x), Math.abs(b.right - x));
    const dy = Math.max(Math.abs(b.top - y), Math.abs(b.bottom - y));
    const delay = Math.max(0, Math.hypot(dx, dy) / WAVE + 89 - (performance.now() - start));
    el.animate(
      { opacity: [0, 1], transform: ["translateY(4px)", "none"] },
      { duration: 377, delay, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "backwards" },
    );
  };
  for (const el of dialog.querySelectorAll<HTMLElement>(".el-top > *, .el-ask > *, .el-trace, .el-chip")) surface(el);
  void last?.finished.finally(() => {
    dialog.classList.remove("el-arriving");
    water.remove();
    surface = () => {};
  });
}

export async function open(origin?: { x: number; y: number }) {
  if (dialog.open) return;
  opener = document.activeElement as HTMLElement | null;
  dialog.showModal();
  reveal(origin);
  document.documentElement.classList.add("in-elevator");
  input.focus();
  if (state !== "cold") return;
  // A phone asks before a 46 MB download; a desktop, or a phone that has it cached, just loads.
  const phone = matchMedia("(pointer: coarse)").matches;
  if (phone && !(await modelCached())) {
    state = "asking";
    consent.hidden = false;
    surface(consent);
    status("Waiting for your OK to download");
  } else start(false);
}

function close() {
  if (dialog.open) dialog.close();
}

dialog.addEventListener("close", () => {
  document.documentElement.classList.remove("in-elevator");
  opener?.focus();
});
$(".el-close").addEventListener("click", close);
$(".el-yes").addEventListener("click", () => {
  consent.hidden = true;
  start(false);
  input.focus();
});
$(".el-no").addEventListener("click", () => {
  consent.hidden = true;
  start(true);
  input.focus();
});

function submit(q: string) {
  const question = q.trim();
  if (!question) return;
  input.value = question;
  dialog.classList.add("el-asked");
  if (state === "asking") {
    pending = question;
    status("Choose download or keywords first");
    $(".el-yes").focus();
    return;
  }
  send({ type: "ask", id: ++askId, q: question, fit });
  busy();
}
form.addEventListener("submit", (e) => {
  e.preventDefault();
  submit(input.value);
});
dialog.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const again = target.closest<HTMLElement>("[data-ask]");
  if (again) return submit(again.dataset.ask ?? "");
  // Following a link leaves the elevator for that floor.
  if (target.closest("a[href]")) close();
});
