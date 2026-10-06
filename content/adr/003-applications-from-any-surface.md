---
id: adr-003
title: Applications are staged on the site, so any Claude surface can run the pipeline
status: accepted
date: 2026-10-07
---

## Context

Phase 3 turns a job post into a tailored application. Janrau wants to run it from Claude Code
on the laptop, from cloud Claude Code sessions in the Claude app, and from Cowork. The phase 2
publisher assumed the laptop: variants in a gitignored folder, the phone number in `.env`, and
Wrangler logged in with Janrau's Cloudflare account.

A cloud session has none of those. Only git history persists between sessions; secrets come
from environment settings; job sites and Cloudflare's API are outside the default network
allowlist. Cowork has no shell at all, as far as its documentation shows.

## Decision

- **State lives on janrau.dev.** `pnpm job stage` sends the validated variant, the post and
  its three PDFs to `POST /admin/api/stage`; the Worker validates again against the CV it was
  built with and stores everything unpublished in D1 and KV. `private/drafts/` is scratch.
- **Publishing is a separate step:** a button on `/admin/review/<slug>` or `pnpm job publish`.
  The public route serves published applications only.
- **The CLI authenticates with a Cloudflare Access service token,** not a Cloudflare API token.
  It can reach `/admin` and nothing else in the account.
- **PDFs are rendered by the CLI** (Typst in Node works on the laptop and in cloud sessions)
  and uploaded; the Worker stays small.
- **Attachments download from `/admin`,** so they reach any device, Cowork included.
- **The skill carries Janrau's tailoring rules,** because cloud sessions don't see the
  laptop's memory.

## Alternatives considered

| Option | Why not |
|---|---|
| Keep Wrangler with a Cloudflare API token in cloud sessions | A token able to write D1 and KV directly is far broader than "stage an application", and it bypasses the Worker's validation. |
| Commit variants to a private branch | Application data would sit in a public repo's history. |
| Render PDFs on the Worker | The Typst WebAssembly compiler is several MB and slow on cold starts (ADR-002). |
| A paste form on `/admin` that calls an LLM | Needs an LLM API key and spend on the Worker; it's phase 5. The CLI path costs nothing extra. |

## Consequences

- A session can stop after staging and another, on any surface, can review and publish.
- The Worker re-validates every variant, so a broken CLI can't stage a dishonest page.
- Each cloud environment needs three variables and a network allowlist (`docs/apply-anywhere.md`).
- Staged applications appear in `/admin` immediately, marked "Not published".
