import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { env, pipeline } from "@huggingface/transformers";
import type { Content } from "@janrau/schema";
import {
  adrPassages,
  curatedQuestions,
  cvPassages,
  indexTerms,
  questionTexts,
  termText,
  workPassages,
} from "./passages.ts";
import type { ElevatorIndex, ModelFile } from "./types.ts";
import { quantize } from "./vectors.ts";

export const MODEL = "Xenova/bge-small-en-v1.5";
export const DIMS = 384;
/** bge models expect this before a question, and nothing before a passage. */
export const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";
const MODEL_FILES = ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"];
/** Workers static assets cap each file at 25 MiB; the 34 MB model ships in 20 MiB parts. */
const PART_BYTES = 20 * 1024 * 1024;
/** The plain WebAssembly build (11 MB); the default WebGPU build is twice the size. */
const RUNTIME_FILES = ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"];

export interface BuildOptions {
  content: Content;
  adrDir: string;
  /** apps/site/public/elevator */
  outDir: string;
  /** Downloaded model files and the embedding cache live here, outside git. */
  cacheDir: string;
  log?: (line: string) => void;
}

type Embedder = (text: string) => Promise<number[]>;

export async function embedder(cacheDir: string): Promise<Embedder> {
  env.cacheDir = join(cacheDir, "models");
  const extract = await pipeline("feature-extraction", MODEL, { dtype: "q8" });
  return async (text) => Array.from((await extract(text, { pooling: "mean", normalize: true })).data as Float32Array);
}

/** Embeds only what changed: vectors are cached by a hash of the model and the text. */
export async function embedAll(texts: string[], cacheDir: string, log: (l: string) => void): Promise<number[][]> {
  const file = join(cacheDir, "embeddings.json");
  const cache: Record<string, number[]> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const key = (t: string) => createHash("sha256").update(`${MODEL}\n${t}`).digest("hex").slice(0, 32);
  const missing = [...new Set(texts.filter((t) => !cache[key(t)]))];
  log(`elevator: ${texts.length} texts, ${missing.length} to embed`);
  if (missing.length) {
    const embed = await embedder(cacheDir);
    for (const t of missing) cache[key(t)] = (await embed(t)).map((x) => Math.round(x * 1e6) / 1e6);
    const used = new Set(texts.map(key));
    for (const k of Object.keys(cache)) if (!used.has(k)) delete cache[k];
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(file, JSON.stringify(cache));
  }
  return texts.map((t) => cache[key(t)] as number[]);
}

/** Copy the model next to the site, splitting files over the asset limit. */
function copyModel(cacheDir: string, outDir: string): ModelFile[] {
  return MODEL_FILES.map((path) => {
    const src = join(cacheDir, "models", MODEL, path);
    const bytes = readFileSync(src);
    const dest = join(outDir, "models", MODEL, path);
    mkdirSync(dirname(dest), { recursive: true });
    if (bytes.length <= PART_BYTES) {
      writeFileSync(dest, bytes);
      return { path, parts: [path], bytes: bytes.length };
    }
    const parts: string[] = [];
    for (let i = 0, start = 0; start < bytes.length; i++, start += PART_BYTES) {
      parts.push(`${path}.part${i}`);
      writeFileSync(`${dest}.part${i}`, bytes.subarray(start, start + PART_BYTES));
    }
    return { path, parts, bytes: bytes.length };
  });
}

/** The runtime files that match the onnxruntime-web the site bundles (resolved through Transformers.js). */
function copyRuntime(outDir: string): { path: string; bytes: number }[] {
  const fromTransformers = createRequire(createRequire(import.meta.url).resolve("@huggingface/transformers"));
  // The package exports no package.json; its main entry sits in dist/, next to the runtime files.
  const dist = dirname(fromTransformers.resolve("onnxruntime-web"));
  mkdirSync(join(outDir, "runtime"), { recursive: true });
  return RUNTIME_FILES.map((f) => {
    copyFileSync(join(dist, f), join(outDir, "runtime", f));
    return { path: f, bytes: statSync(join(dist, f)).size };
  });
}

/** Passages, terms and curated questions with their embeddings, in vectors.bin order. */
export async function collect(o: Pick<BuildOptions, "content" | "adrDir" | "cacheDir" | "log">) {
  const passages = [...cvPassages(o.content), ...workPassages(o.content), ...adrPassages(o.adrDir)];
  const terms = indexTerms(o.content.glossary, o.content, passages);
  const questions = curatedQuestions(o.content.questions, passages);
  const vectors = await embedAll(
    [...passages.map((p) => p.text), ...terms.map(termText), ...questionTexts(o.content.questions)],
    o.cacheDir,
    o.log ?? (() => {}),
  );
  return { passages, terms, questions, vectors };
}

export async function buildIndex(o: BuildOptions): Promise<ElevatorIndex> {
  const log = o.log ?? (() => {});
  const { passages, terms, questions, vectors } = await collect(o);

  rmSync(o.outDir, { recursive: true, force: true });
  mkdirSync(o.outDir, { recursive: true });
  const bin = quantize(vectors, DIMS);
  writeFileSync(join(o.outDir, "vectors.bin"), bin);
  // The model is cached by the embedding step above (or downloaded now, when nothing changed).
  if (!existsSync(join(o.cacheDir, "models", MODEL, "onnx/model_quantized.onnx"))) await embedder(o.cacheDir);
  const index: ElevatorIndex = {
    version: createHash("sha256").update(bin).digest("hex").slice(0, 12),
    model: { id: MODEL, dims: DIMS, dtype: "q8", queryPrefix: QUERY_PREFIX, files: copyModel(o.cacheDir, o.outDir) },
    runtime: { files: copyRuntime(o.outDir) },
    passages,
    terms,
    questions,
    contact: o.content.cv.person.links.email,
    vectors: { rows: vectors.length, bytes: bin.length },
  };
  writeFileSync(join(o.outDir, "index.json"), JSON.stringify(index));
  log(
    `elevator: ${passages.length} passages, ${terms.length} terms, ${questions.length} questions, vectors ${Math.round(bin.length / 1024)} KB`,
  );
  return index;
}
