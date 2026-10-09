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

/** Where the room was asked for. From the lattice's red cell, `field` is the hero lattice's box. */
export interface Origin {
  x: number;
  y: number;
  field?: { left: number; top: number; right: number; bottom: number };
  /** The hero lattice's own cells (viewport centres); quiet ones sit behind text and never surge. */
  cells?: { x: number; y: number; quiet: boolean }[];
}

/** The lattice's cell (Lattice.astro): pointy-top, edge 21. */
const HW = 36.3731;
const PITCH = 31.5;
/** The pond's own wave (Lattice.astro): one cell per 55ms. From the nav, the room comes faster. */
const POND_SPEED = HW / 55;
const NAV_SPEED = 1.6;
/** The pond's surge (Lattice.astro): rise 144, dwell 89, release 610. */
const RISE = 144;
const DWELL = 89;
const RELEASE = 610;
/** The pond's amplitude: spreading × absorption. It falls below 5% (stills) near ring 13. */
const pondAmp = (ring: number) => (0.55 * Math.exp(-ring / 13)) / Math.sqrt(1 + ring);
/** Past where the pond stills, the extended wave keeps this much, so it reaches the far edge. */
const CARRY = 0.12;
const STILL_RING = 13;
/** The room's ground forming under a cell, and the lattice dissolving once the room has landed. */
const FORM = 377;
const DISSOLVE = 377;

/** Brings a part of the room up when the arriving wave reaches it; nothing once it has landed. */
let surface: (el: HTMLElement) => void = () => {};

/**
 * Shuhari, named: the room arrives on the pond's own wave, extended. A strike on the red cell
 * first plays the lattice's native ripple untouched; the same wave (same speed, same surge,
 * cell by cell) then keeps travelling past the lattice's edge instead of stilling, until it
 * covers the window. Each cell becomes the room only after its own surge has peaked, so the
 * room forms in the wave's wake; once it has landed, the lattice dissolves into it. Opened
 * from the nav there is no native ripple, so the same wave runs at once and faster. The page
 * beyond the wave stays still. Reduced motion: the room is simply there.
 */
function reveal(origin?: Origin) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // The room's own box, not window.innerWidth: that counts the scrollbar's gutter, and a
  // canvas sized to it is squeezed into the room, drifting off the page's lattice.
  const w = dialog.clientWidth;
  const h = dialog.clientHeight;
  const { x, y, field, cells: own = [] } = origin ?? { x: w / 2, y: h / 2 };
  const speed = field ? POND_SPEED : NAV_SPEED;
  // One canvas, drawn each frame: a thousand animated elements would stall the page.
  const water = document.createElement("canvas");
  water.className = "el-water";
  water.setAttribute("aria-hidden", "true");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  water.width = Math.round(w * dpr);
  water.height = Math.round(h * dpr);
  const ctx = water.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(dialog);
  const ground = css.getPropertyValue("--ground").trim();
  const line = css.getPropertyValue("--line").trim();
  const crest = css.getPropertyValue("--line-strong").trim();
  // The lattice's cells around the strike (on the home page, the red cell's centre, so this
  // tiling is the hero lattice's own, extended over the window).
  // drawn: one of the page's own cells, whose hairlines this canvas takes over from the first frame.
  // native: the page's lattice also does its surge (it stirs there, and the cell isn't quiet).
  type Cell = { x: number; y: number; at: number; amp: number; drawn: boolean; native: boolean };
  const cells: Cell[] = [];
  // Cells sit at whole half-cells and rows from the strike, so this key never rounds at a tie.
  const key = (cx: number, cy: number) => `${Math.round((cx - x) / (HW / 2))},${Math.round((cy - y) / PITCH)}`;
  const page = new Map(own.map((c) => [key(c.x, c.y), c]));
  const rows = Math.ceil(y / PITCH) + 1;
  const cols = Math.ceil(x / HW) + 2;
  for (let j = -rows; j * PITCH + y < h + PITCH; j++) {
    const cy = y + j * PITCH;
    const shift = j & 1 ? HW / 2 : 0;
    for (let i = -cols; i * HW + x + shift < w + HW; i++) {
      const cx = x + shift + i * HW;
      if (cx < -HW) continue;
      const d = Math.hypot(cx - x, cy - y);
      const ring = d / HW;
      const mine = page.get(key(cx, cy));
      const native = !!mine && !mine.quiet && ring < STILL_RING;
      cells.push({ x: cx, y: cy, at: d / speed, amp: Math.max(pondAmp(ring), CARRY), drawn: !!mine, native });
    }
  }
  // The room forms once the cell's surge is half released, and is whole as the surge ends.
  const formed = (c: Cell) => c.at + RISE + DWELL + RELEASE / 2;
  const landed = Math.max(...cells.map(formed)) + FORM;
  const end = Math.max(landed, Math.max(...cells.map((c) => c.at)) + RISE + DWELL + RELEASE) + DISSOLVE;
  const hex = (path: Path2D, cx: number, cy: number) => {
    const a = HW / 2;
    path.moveTo(cx, cy - 21);
    path.lineTo(cx + a, cy - 10.5);
    path.lineTo(cx + a, cy + 10.5);
    path.lineTo(cx, cy + 21);
    path.lineTo(cx - a, cy + 10.5);
    path.lineTo(cx - a, cy - 10.5);
    path.closePath();
  };
  /** The pond's surge at time t since arrival: rise, dwell, then release. */
  const surge = (t: number) =>
    t <= 0 ? 0 : t < RISE ? t / RISE : t < RISE + DWELL ? 1 : Math.max(0, 1 - (t - RISE - DWELL) / RELEASE);
  ctx.lineWidth = 1;
  const t0 = performance.now();
  const frame = (now: number) => {
    if (!dialog.open) return done();
    const t = now - t0;
    ctx.clearRect(0, 0, w, h);
    const reached = new Path2D();
    const solid = new Path2D();
    const forming: { cell: Path2D; alpha: number }[] = [];
    const stirring: { cell: Path2D; alpha: number }[] = [];
    for (const c of cells) {
      // The page's own cells keep their hairlines from the first frame (this canvas draws them
      // now); the rest of the lattice is drawn as the wave reaches it.
      if (c.drawn) hex(reached, c.x, c.y);
      if (t <= c.at) continue;
      const f = (t - formed(c)) / FORM;
      if (!c.drawn) hex(reached, c.x, c.y);
      if (f >= 1) hex(solid, c.x, c.y);
      else if (f > 0) {
        const cell = new Path2D();
        hex(cell, c.x, c.y);
        forming.push({ cell, alpha: f });
      }
      const s = c.native ? 0 : surge(t - c.at) * c.amp;
      if (s > 0.01) {
        const cell = new Path2D();
        hex(cell, c.x, c.y);
        stirring.push({ cell, alpha: s });
      }
    }
    // The room's ground, forming in the wave's wake.
    ctx.fillStyle = ground;
    ctx.globalAlpha = 1;
    ctx.fill(solid);

    for (const f of forming) {
      ctx.globalAlpha = f.alpha;
      ctx.fill(f.cell);
    }
    // The wave itself: each cell it reaches surges as the pond's do.
    ctx.fillStyle = crest;
    for (const s of stirring) {
      ctx.globalAlpha = s.alpha;
      ctx.fill(s.cell);
    }
    // The lattice, drawn as the wave extends it; once the room has landed, it dissolves.
    ctx.globalAlpha = t < landed ? 1 : Math.max(0, 1 - (t - landed) / DISSOLVE);
    ctx.strokeStyle = line;
    ctx.stroke(reached);
    ctx.globalAlpha = 1;
    if (t < end && dialog.open) requestAnimationFrame(frame);
    else done();
  };
  /** The room has landed, or was closed while arriving. */
  const done = () => {
    dialog.classList.remove("el-arriving");
    water.remove();
    surface = () => {};
  };
  dialog.classList.add("el-arriving");
  dialog.prepend(water);
  // The page's lattice hands its hairlines to this one: both share one geometry, but each
  // rounds to pixels its own way, and two copies of a line read as a misprint. Closing the
  // room hands them back.
  requestAnimationFrame((now) => {
    if (dialog.open) document.documentElement.classList.add("lattice-handed");
    frame(now);
  });
  // Each part of the room surfaces once the room has formed under all of it, including parts
  // shown later while the wave is still spreading (the phone's download question).
  const start = performance.now();
  surface = (el) => {
    const b = el.getBoundingClientRect();
    const dx = Math.max(Math.abs(b.left - x), Math.abs(b.right - x));
    const dy = Math.max(Math.abs(b.top - y), Math.abs(b.bottom - y));
    const at = (Math.hypot(dx, dy) + HW) / speed + RISE + DWELL + RELEASE / 2 + FORM / 2;
    el.animate(
      { opacity: [0, 1], transform: ["translateY(4px)", "none"] },
      {
        duration: 377,
        delay: Math.max(0, at - (performance.now() - start)),
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "backwards",
      },
    );
  };
  for (const el of dialog.querySelectorAll<HTMLElement>(".el-top > *, .el-ask > *, .el-trace, .el-chip")) surface(el);
}

export async function open(origin?: Origin) {
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
  document.documentElement.classList.remove("in-elevator", "lattice-handed");
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
