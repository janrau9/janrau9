---
id: proj.claude-skills
title: Seiza and my Claude skills
subtitle: A design system and engineering disciplines, packaged for AI agents
status: live
statusNote: Public repo. Seiza runs in production in Slash and synchd.
period: 2026-06 – present
role: Solo. Every design decision in Seiza is mine.
stack: [Markdown, CSS, OKLCH, Bash]
repo: https://github.com/janrau9/claude-skills
draft: true     # TODO (Janrau): review
---

## The problem

I build most of my software with AI agents. Without guidance, an agent produces generic interfaces and generic prose. I wanted my standards (how my apps look, how docs are organised, how engineers should write) to travel with every agent session, in every project, without repeating myself.

Claude Code skills are instruction packs an agent loads when a task needs them. This repo holds mine, and the most substantial is **Seiza**, my design system.

## Seiza

Seiza (星座, "constellation") is Japanese architectural minimalism under a night sky:
- **Monochrome hierarchy in OKLCH.** Hierarchy comes from lightness, not colour.
- **One vermilion "seal" accent per view,** on the single most important element.
- **Fibonacci scales** for spacing, corner radii and animation timing.
- **Light and dark themes,** with dark as the native one.
- **12 laws** that settle cases the rules don't cover.

It is stack-agnostic: values and laws, not framework code. It runs in production in Slash and synchd, and this portfolio uses it too.

## Decisions

| I chose | Over | Because |
|---|---|---|
| OKLCH colours | HSL | OKLCH lightness is perceptual. HSL's lightness misleads, so two "equal" colours look different. |
| Fixing the accent's lightness and chroma, freeing only its hue | A free accent colour | Any hue then carries the same visual weight in both themes. |
| Sentence case at 11px for small labels | All-caps labels | The typeface has no true small caps, and synthetic ones render badly. The size bump restores legibility. |
| Banning free-floating gradient glows | Allowing them | They are the signature of machine-made pages. |
| Installing skills as symlinks | Copies | An edit in the repo reaches every install at once. A copy-based installer covers machines without the repo. |

## The other skills

- **doc-writer:** keeps a project's docs as a numbered, cross-linked wiki with an append-only change log. This repo's own docs follow it.
- **plain-language:** applies ISO 24495-1, the plain-language standard, to explanations, reports and engineering writing.

## Outcome

- **In production:** Seiza styles Slash and synchd, each crediting it.
- **Public:** the repo is open, with a one-line installer.
- **Honest scale:** no outside installs yet. These skills are my own working standards, made reusable.
