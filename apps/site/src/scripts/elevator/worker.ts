/// <reference lib="webworker" />
import { env, type FeatureExtractionPipeline, pipeline } from "@huggingface/transformers";
import { type ElevatorIndex, Planner, scoreMaps, Vectors } from "@janrau/elevator";
import { CACHE, COMPLETE, type FromWorker, now, type Span, type ToWorker } from "./protocol";

/**
 * Elevator mode's engine, off the main thread. Loads the index, the WebAssembly runtime
 * and the model, all from janrau.dev, and reports every step as a timed span so the
 * visitor can watch why they are waiting. Nothing typed leaves this worker.
 */

const BASE = "/elevator/";
// Transformers.js's pipeline() overloads are too large for TypeScript to resolve here (TS2590).
const featureExtraction = pipeline as unknown as (
  task: "feature-extraction",
  model: string,
  options: { dtype: string },
) => Promise<FeatureExtractionPipeline>;
const post = (m: FromWorker) => postMessage(m);
const mb = (b: number) => `${(b / 1e6).toFixed(b < 1e7 ? 1 : 0)} MB`;
const kb = (b: number) => (b < 1e6 ? `${Math.round(b / 1024)} KB` : mb(b));

let index: ElevatorIndex | undefined;
let planner: Planner | undefined;
let vectors: Vectors | undefined;
let extract: FeatureExtractionPipeline | undefined;
let keywordsOnly = false;
let ready = false;
const waiting: { m: Extract<ToWorker, { type: "ask" }>; s: ReturnType<typeof span> }[] = [];
let seq = 0;

function span(name: string, extra: Partial<Span> = {}) {
  const s: Span = { id: `s${seq++}`, name, state: "running", start: now(), ...extra };
  post({ type: "span", span: s });
  let last = 0;
  return {
    update(fields: Partial<Span>, throttle = true) {
      Object.assign(s, fields);
      const t = now();
      if (throttle && t - last < 100) return;
      last = t;
      post({ type: "span", span: { ...s } });
    },
    done(fields: Partial<Span> = {}) {
      Object.assign(s, { state: "done", end: now() }, fields);
      post({ type: "span", span: { ...s } });
    },
    fail(note: string) {
      Object.assign(s, { state: "failed", end: now(), note });
      post({ type: "span", span: { ...s } });
    },
  };
}

/** Fetch with a byte count for the progress line. */
async function download(url: string, onBytes: (n: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onBytes(got);
  }
  return new Blob(chunks as BlobPart[]).arrayBuffer();
}

/** A file from Cache Storage, or downloaded (in parts, when split) and stored for next time. */
async function cached(cache: Cache, path: string, parts: string[], onBytes: (n: number) => void) {
  const key = new URL(BASE + path, location.origin).href;
  const hit = await cache.match(key);
  if (hit) return { buffer: await hit.arrayBuffer(), fromCache: true };
  const buffers: ArrayBuffer[] = [];
  let before = 0;
  for (const part of parts) {
    const b = await download(BASE + part, (n) => onBytes(before + n));
    before += b.byteLength;
    buffers.push(b);
  }
  const buffer = await new Blob(buffers).arrayBuffer();
  await cache.put(key, new Response(buffer));
  return { buffer, fromCache: false };
}

async function load(onlyKeywords: boolean) {
  keywordsOnly = onlyKeywords;
  const s1 = span("Index");
  try {
    const [res, bin] = await Promise.all([fetch(`${BASE}index.json`), fetch(`${BASE}vectors.bin`)]);
    index = (await res.json()) as ElevatorIndex;
    planner = new Planner(index);
    vectors = new Vectors(await bin.arrayBuffer(), index.vectors.rows, index.model.dims);
    s1.done({
      size: kb(Number(res.headers.get("content-length") ?? 0) + index.vectors.bytes),
      note: `${index.passages.length} passages and ${index.terms.length} glossary terms`,
    });
  } catch (err) {
    s1.fail(`Couldn't load the index: ${err}`);
    post({ type: "error", message: "The index didn't load. Check your connection and try again." });
    return;
  }

  if (onlyKeywords) {
    span("Model").done({ state: "skipped", note: "Keywords only: nothing downloaded" });
    return finish();
  }
  try {
    const cache = await caches.open(CACHE);
    // Drop files from older builds: keys this index no longer names.
    const keep = new Set(
      [
        ...index.model.files.map((f) => `models/${index?.model.id}/${f.path}`),
        ...index.runtime.files.map((f) => `runtime/${f.path}`),
      ].map((p) => new URL(BASE + p, location.origin).href),
    );
    for (const req of await cache.keys())
      if (!keep.has(req.url) && !req.url.endsWith(COMPLETE)) await cache.delete(req);

    const runtime = index.runtime.files.find((f) => f.path.endsWith(".wasm"));
    const s2 = span("Runtime", { note: "ONNX Runtime, WebAssembly" });
    if (runtime) {
      const { buffer, fromCache } = await cached(cache, `runtime/${runtime.path}`, [`runtime/${runtime.path}`], (n) =>
        s2.update({ size: `${mb(n)} of ${mb(runtime.bytes)}` }),
      );
      // Hand the runtime over directly, so it isn't downloaded twice.
      if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmBinary = buffer;
      s2.done({ size: fromCache ? "from cache" : mb(runtime.bytes) });
    }

    const total = index.model.files.reduce((a, f) => a + f.bytes, 0);
    const s3 = span("Model", { note: `${index.model.id.split("/")[1]}, int8` });
    let done = 0;
    let fromCache = true;
    for (const f of index.model.files) {
      const r = await cached(
        cache,
        `models/${index.model.id}/${f.path}`,
        f.parts.map((p) => `models/${index?.model.id}/${p}`),
        (n) => s3.update({ size: `${mb(done + n)} of ${mb(total)}` }),
      );
      done += f.bytes;
      fromCache &&= r.fromCache;
    }
    await cache.put(new URL(COMPLETE, location.origin).href, new Response("ok"));
    s3.done({ size: fromCache ? "from cache" : mb(total) });

    const s4 = span("Warm-up", { note: "First inference, so your first answer is fast" });
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = `${BASE}models/`;
    env.useBrowserCache = false;
    env.useCustomCache = true;
    env.customCache = {
      match: (key: string) => cache.match(new URL(key, location.origin).href),
      put: async () => {},
    };
    if (env.backends.onnx.wasm) {
      env.backends.onnx.wasm.wasmPaths = `${BASE}runtime/`;
      env.backends.onnx.wasm.numThreads = 1;
    }
    extract = await featureExtraction("feature-extraction", index.model.id, { dtype: index.model.dtype });
    await extract("warm up", { pooling: "mean", normalize: true });
    s4.done();
  } catch (err) {
    console.error(err);
    span("Model").done({ state: "failed", note: "The model didn't load; answering by keywords instead" });
    keywordsOnly = true;
  }
  finish();
}

function finish() {
  ready = true;
  post({ type: "ready", keywordsOnly });
  for (const { m, s } of waiting.splice(0)) {
    s.done({ note: "Answered as soon as the model was ready" });
    void answer(m);
  }
}

async function answer(m: Extract<ToWorker, { type: "ask" }>) {
  if (!index || !planner || !vectors) return;
  let scores: ReturnType<typeof scoreMaps> | undefined;
  if (extract && !keywordsOnly) {
    const s = span("Embed", { note: `“${m.q}” → ${index.model.dims} numbers` });
    const out = await extract(index.model.queryPrefix + m.q, { pooling: "mean", normalize: true });
    scores = scoreMaps(
      vectors.scores(out.data as Float32Array),
      index.passages.map((p) => p.id),
      index.terms.map((t) => t.id),
    );
    s.done();
  }
  const s = span("Rank");
  const plan = planner.plan(m.q, scores, new Set(m.fit));
  s.done({ note: `${index.passages.length} passages · ${plan.termsNote}${m.fit.length ? " · fit-table bonus" : ""}` });
  post({ type: "answer", id: m.id, q: m.q, plan });
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === "load") void load(m.keywordsOnly);
  else if (ready) void answer(m);
  else {
    waiting.push({
      m,
      s: span("Your question", { state: "waiting", note: "Waiting for the model; answered as soon as it's ready" }),
    });
  }
};
