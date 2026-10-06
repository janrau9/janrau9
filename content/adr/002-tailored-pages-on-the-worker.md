---
id: adr-002
title: Tailored pages render on the Worker from D1, with PDFs in KV
status: accepted
date: 2026-10-06
---

## Context

Every job application gets a private link, `/for/<slug>`, with a page and a PDF tailored to that job. Links must go live without rebuilding the site, so the page renders on request. The general site stays static.

The spec planned R2 for PDFs and job-post snapshots. R2 can't be enabled on this account without adding a payment method. D1 can't hold the PDFs either: a single SQL statement is capped at 100 KB, and a tailored PDF is about 70 KB before it is encoded into SQL.

## Decision

- **One Worker serves both.** The Astro Cloudflare adapter builds static pages as assets and only `/for/*` as on-demand routes. Static files never touch the Worker.
- **D1 holds applications and variants.** Two tables, `applications` and `variants`, created by `apps/site/migrations/`.
- **KV holds tailored PDFs and post snapshots,** under `cv:<slug>` and `post:<slug>`. Values up to 25 MB, on the free tier.
- **The Worker never reads `content/` from disk.** It has none. The CV is bundled into the Worker at build time as `site-data.json`, and a variant is resolved against it on each request. IDs removed from the CV since publishing are dropped, not fatal.
- **Failure falls back, never errors.** Unknown, withdrawn or malformed links answer 404. If D1 fails or a stored variant no longer parses, the visitor is sent to the general page.
- **Variants are published from the laptop** with `pnpm publish-variant <file> --yes`, which validates, renders the PDF, and writes D1 and KV through Wrangler. Hand-written variants and job posts live in the gitignored `private/` folder.

## Alternatives considered

| Option | Why not |
|---|---|
| R2 for PDFs | Needs a payment method on the account. A drop-in swap later: same keys, different binding. |
| PDFs as BLOBs in D1 | The 100 KB statement limit makes inserting a 70 KB PDF awkward (chunking). |
| Rendering the PDF on the Worker | The Typst WebAssembly compiler is several MB, close to the free plan's Worker size limit, and slow on cold starts. |
| Rebuilding the static site per application | Minutes per link instead of seconds, and every application would land in the public build output. |
| A separate Worker for `/for/*` | Two deploys and two configs for one site; the adapter already splits static and dynamic. |

## Consequences

- The deploy now includes a Worker script, and D1 schema changes need `wrangler d1 migrations apply --remote` before deploying.
- Security headers for Worker responses come from middleware that reads `public/_headers`, so static and dynamic responses can't drift apart.
- A tailored link stays valid as `cv.yaml` changes; its content follows the current CV, minus anything removed.
- Moving PDFs to R2 later changes one binding and the publish command, not the pages.
