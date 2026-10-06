---
id: adr-001
title: One content source, validated in CI, in a pnpm monorepo
status: accepted
date: 2026-10-06
---

## Context

The portfolio produces several outputs from the same facts: the website, a general PDF CV, a JSON Resume, and a tailored page and PDF for every job application. A tailored page may only select and order existing claims, never invent them, so every claim needs a stable ID that a variant can reference.

Facts copied into several places drift apart. The previous CV had already drifted: it linked a GitHub account that isn't mine and listed skills no project backed up.

One person maintains all of this, so the tooling has to be boring and the checks automatic.

## Decision

- **`content/cv.yaml` is the single source of truth** for person, experience, education, projects, highlights, decisions and skills. Case studies live in `content/work/*.md`, and their frontmatter must agree with `cv.yaml`.
- **Every item has a stable, human-readable ID** (`proj.slash.h3`). Published IDs never change.
- **A Zod schema in `packages/schema` defines the shape**, and a validator adds the rules a type can't express: unique IDs, references that resolve, exactly 3 featured projects, case studies that match their project, no `TODO` in published case studies.
- **CI fails on invalid content.** The schema also generates `content/cv.schema.json`, so editors validate `cv.yaml` while typing; CI fails if that file is stale.
- **Tags come from a fixed vocabulary** (`packages/schema/src/tags.ts`), because the matcher selects by tag and a typo would silently hide an item.
- **pnpm workspaces, TypeScript everywhere**, with Biome for lint and format and Vitest for tests.
- **Private values stay out of the repo.** The repo is public and doubles as my GitHub profile. The phone number lives in `.env` locally and in a repository secret in CI. Research about specific employers lives in the gitignored `research/` folder.

## Alternatives considered

| Option | Why not |
|---|---|
| JSON Resume as the source | Its schema has no IDs, decisions or tags, so variants couldn't reference items. It becomes an output instead. |
| A headless CMS | Another service to run and pay for, and content changes would bypass code review and CI. |
| Markdown only, no YAML | Structured items (highlights with tags and IDs) are awkward in prose and can't be validated. |
| JSON Schema as the source, Zod generated | Zod gives TypeScript types and readable errors; generating JSON Schema from it covers editor support. |
| ESLint + Prettier | Two tools and two configs where Biome is one, with the same coverage for this project. |

## Consequences

- Adding content means editing YAML and running `pnpm validate`. The validator's first run caught three skill names that YAML had silently truncated at a comma.
- Changing the shape of content means changing the schema first, and regenerating `cv.schema.json`.
- A tag must be added to the vocabulary before it can be used.
- Every output (site, PDFs, README, tailored variants) will be generated from this content, so none of them is edited by hand.
