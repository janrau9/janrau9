---
id: proj.kiln
title: kiln
subtitle: IDE-grade code intelligence and runtime debugging for AI coding agents
status: in-use
statusNote: Used daily by my own coding agents across 41 projects. Private for now; going public once the open field reports are fixed.
period: 2026-06 – present
role: Solo. I designed the tool and directed the work; AI coding agents wrote much of the code under my review, and kiln itself checks that code.
stack: [TypeScript, Node.js, Language Server Protocol, Chrome DevTools Protocol, Debug Adapter Protocol, tree-sitter, pyright, Vitest]
repo: private   # going public
featured: true
draft: true     # TODO (Janrau): review. Screenshots or a terminal recording come after the content is final.
---

## The problem

I write most of my code with AI coding agents. I wanted their work to be easier to observe and debug, and I kept seeing the same weakness: an agent in a terminal answers "who calls this function?" with `grep`.

`grep` gets cross-file questions wrong without saying so. It misses aliased imports (`import { x as y }`) and re-exports, and it matches unrelated symbols that share a name. An agent that trusts those answers makes confident, wrong edits.

My editor never has this problem, because it asks a language server. kiln gives the agent the same language server through plain shell commands.

## How it works

One concrete call: an agent asks who uses `formatPrice`.

1. The agent runs `kiln refs formatPrice --at src/cart.ts:12`.
2. A thin CLI sends the request over a Unix socket to a warm daemon for that project, so the language server isn't restarted on every call.
3. The daemon asks the language server (tsserver for TypeScript, pyright for Python) for references. These are the same answers the editor gives.
4. If the language server is down, kiln falls back to ripgrep and labels the result as text matches. It never blocks the agent and never presents a guess as fact.
5. The agent gets a compact list of files and lines, including aliased imports that `grep` would miss.

After every edit, the agent runs `kiln errors <file>` to get type errors. When something crashes, `kiln crash` captures the stack and local variables at the exception, so the agent doesn't need to scatter `console.log` calls.

## Decisions

| I chose | Over | Because |
|---|---|---|
| A CLI run through the shell | An MCP server or editor hooks | It works with any agent harness, I can use it myself in a terminal, and it composes with other shell tools. |
| Leading with accuracy (refs, definitions, call graph) | Leading with token savings | Models already read files selectively, so the token advantage is thin and shrinking. Wrong answers are the real cost. |
| Refusing with a labelled error when no fresh diagnostics arrive | Serving the last known result | A clean bill of health must never come from not having looked. |
| pyright and debugpy for Python | Faster but different checkers | `kiln errors` must agree exactly with the checker the project runs in CI. |
| One-shot runtime commands (crash capture, logpoints, state snapshots) | Step-by-step debugging | Stepping suits a human at a keyboard, not an agent working in batches. |
| Staying on TypeScript | A Rust rewrite | kiln orchestrates engines that are already native. Rust would save milliseconds of glue and cost iteration speed. |

## The dogfooding loop

kiln checks code that AI writes, so kiln itself has to be trustworthy. My rule for every agent session: when kiln gives an illogical answer, the agent stops, finds the truth another way, and files a field report. Quietly working around a wrong answer is not allowed.

That loop has produced 39 field reports and found bugs that tests alone had missed:

- **The cold window.** Right after start-up, before the language server had loaded the project, kiln could return a confident `0` references or a false "no errors". kiln never asked the server to report load progress, so it fell back to a fixed 2.5-second wait. Fixed by declaring the missing capability, so answers now wait for real project-load progress.
- **Stale diagnostics.** After an edit, `kiln errors` could return the result from before the edit. Fixed by requiring fresh analysis after every file sync, and failing loudly (exit code 3) otherwise.
- **`$` in file paths.** The language server encodes `$` as `%24`, so every dynamic route file in a TanStack Router app (about 20 of 45 files in one repo) silently got no diagnostics. Fixed by keying diagnostics by the decoded path.
- **The project boundary.** `refs` silently left out files outside the TypeScript project, such as excluded test folders. In the first field report, that hid a test that compared a value with itself, and a dead default shipped behind it. Fixed by labelling the boundary on every result, so a partial answer never looks complete.

## Outcome

- **Real use:** 1,114 calls by my agents across 41 projects between July and October 2026. The most used commands: `errors` 731, `refs` 237.
- **Measured accuracy:** on an aliased-import benchmark, kiln found the aliased call; `rg -w` missed it and returned 3 false matches.
- **Size:** about 8,000 lines of TypeScript, about 227 tests (unit, plus integration tests against real language servers and debuggers), and 30 dated design decisions with reasons.
- **Languages:** TypeScript/JavaScript and Python, for both code questions and runtime debugging.

## Open problems

The loop keeps finding work. 27 field reports are newer than the last release. The biggest group (16 reports) is `kiln errors` refusing with "no fresh analysis" after an edit, which sometimes needs a daemon restart. That is the right failure direction, refusing instead of lying, but it costs the agent time. Fixing it comes before the public release.

I'm also building benchmarks that measure task outcomes (fewer wrong edits, fewer missed callers), not just single-query accuracy.
