---
id: adr-004
title: Elevator mode retrieves and quotes in the visitor's browser; it never generates text
status: accepted
date: 2026-10-08
---

## Context

A recruiter has one question, such as "has he done real-time sync?", and the site answers it only if they find the right case study. An AI chat would answer directly, but it would cost tokens on every question. It would also send visitors' questions to a third party, and it could state a fit I don't have.

I measured three small embedding models on the 22 requirements in my hand-made fit tables. The best one, bge-small-en-v1.5, put the right evidence in its top three 64% of the time. One answer in three would carry the wrong evidence, so the model must never state a fit; it may only find passages.

Visitors also type terms my content never uses: "go lang", "k8s", "devops". Embeddings alone matched "kubernetes" to unrelated work at 0.575, and they handle typos badly.

## Decision

- **Retrieval only.** The model ranks passages; fixed rules choose the layout (project card, timeline, decisions, quotes). Every sentence shown is quoted from `cv.yaml`, the published case studies or these decision records. The only other text is a handful of fixed phrases.
- **In the visitor's browser.** Transformers.js runs bge-small (int8) and the plain WebAssembly ONNX runtime in a Web Worker. Everything is served from janrau.dev, so `connect-src` stays `'self'`; `script-src` adds `'wasm-unsafe-eval'`.
- **Embeddings built with the site.** `pnpm --filter @janrau/elevator build-index` runs in `prepare:data`. It embeds about 320 passages and the glossary in Node, with the same model files the browser gets, and caches vectors by a hash of their text. The index can't go stale, because every deploy rebuilds it from content.
- **A glossary between the question and the ranking.** `content/glossary.yaml` lists about 130 terms with aliases and an honest status: `have` (cites cv.yaml), `adjacent` or `not-yet` (names the closest terms I have). Matching goes from exact alias, to typo (letter triples), to meaning (term embeddings). The schema rejects a citation that doesn't resolve.
- **Visible loading.** Loading starts when the visitor steps in. Each step (index, runtime, model, warm-up, then embed, rank and compose) is a timed span the visitor can open. Phones ask before the 46 MB download, and they can choose keywords only.
- **Counted, not recorded.** Only matched glossary term ids are counted per day (`/q`), never question text.

## Alternatives

- **A hosted LLM answering in its own words.** Rejected: per-question cost, questions leave the device, and it can overclaim.
- **Search by keyword only.** Rejected as the default: "leading people" missed my Texas Instruments team lead. It stays as the fallback when the model isn't downloaded.
- **Loading the model from the Hugging Face CDN.** Rejected: a third party in the CSP, and visitors' addresses would go to it. Self-hosting needs the 34 MB model split into 20 MiB parts, because Workers static assets cap each file at 25 MiB.
- **all-MiniLM-L6-v2 (23 MB, one file).** Rejected: 55% against bge-small's 64%.

## Consequences

- First use downloads about 46 MB, from janrau.dev; later visits load from Cache Storage. Pages themselves gain only a 2 KB entry script.
- A wrong ranking shows the wrong quote, never a false claim: the visitor reads my words and judges.
- Adding a skill means editing `cv.yaml` or flipping a glossary status; the next deploy re-embeds only what changed.
- The most-asked terms with status `not-yet` show what to learn or write up next.
