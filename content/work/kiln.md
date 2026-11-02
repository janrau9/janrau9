---
id: proj.kiln
title: kiln
subtitle: IDE-grade code intelligence, runtime debugging and a measured map of the code, for AI coding agents
status: in-use
statusNote: Used daily by my own coding agents, 3,492 calls in 94 project folders so far. Private for now; going public once the open field reports are fixed.
period: 2026-06 – present
role: Solo. I designed the tool and directed the work; AI coding agents wrote much of the code under my review, and kiln itself checks that code.
stack: [TypeScript, Node.js, tsserver protocol, Language Server Protocol, Chrome DevTools Protocol, Debug Adapter Protocol, tree-sitter, pyright, Vitest]
repo: private   # going public
featured: true
draft: false
---

## The problem

I write most of my code with AI coding agents. I wanted their work to be easier to observe and debug, and I kept seeing the same weakness: an agent in a terminal answers "who calls this function?" with `grep`.

`grep` gets cross-file questions wrong without saying so. It misses aliased imports (`import { x as y }`) and re-exports, and it matches unrelated symbols that share a name. An agent that trusts those answers makes confident, wrong edits.

My editor never has this problem, because it asks a language server. kiln gives the agent the same language server through plain shell commands.

## How it works

One concrete call: an agent asks who uses `formatPrice`.

1. The agent runs `kiln refs formatPrice --at src/cart.ts:12`.
2. A thin CLI sends the request over a Unix socket to a warm daemon for that workspace, so the language server isn't restarted on every call. In a monorepo, every package shares one daemon and one language server.
3. The daemon asks the language server for references: tsserver over its own protocol, the way VS Code does, or pyright over LSP for Python. These are the same answers the editor gives.
4. If the language server is down, kiln falls back to ripgrep and labels the result as text matches. It never blocks the agent and never presents a guess as fact.
5. The agent gets a compact list of files and lines, including aliased imports that `grep` would miss.

After every edit, the agent runs `kiln errors <file>` to get type errors. When something crashes, `kiln crash` captures the stack and local variables at the exception, so the agent doesn't need to scatter `console.log` calls.

## The measured map

`kiln map` draws a block diagram of a codebase: folders and files as blocks, imports as wires, and the utilities everything uses labelled as rails instead of drawn, the way an electronics schematic labels its power nets. Re-running it on a folder zooms in.

A schematic doesn't tell you what a circuit does; a scope on a powered board does. `kiln map --probe <flow>` runs a real flow and marks every wire: ● fired, ○ never fired in this run, and ⚡ fired with no import to explain it. That last mark is the coupling nobody finds by reading the code, such as an HTTP call from the frontend to the backend, an event bus or dependency injection. No static tool can show it.

## Decisions

| I chose | Over | Because |
|---|---|---|
| A CLI run through the shell | An MCP server or editor hooks | It works with any agent harness, I can use it myself in a terminal, and it composes with other shell tools. |
| Leading with accuracy (refs, definitions, call graph) | Leading with token savings | Models already read files selectively, so the token advantage is thin and shrinking. Wrong answers are the real cost. |
| Refusing with a labelled error when no fresh diagnostics arrive | Serving the last known result | A clean bill of health must never come from not having looked. |
| pyright and debugpy for Python | Faster but different checkers | `kiln errors` must agree exactly with the checker the project runs in CI. |
| One-shot runtime commands (crash capture, logpoints, state snapshots) | Step-by-step debugging | Stepping suits a human at a keyboard, not an agent working in batches. |
| Driving tsserver over its own protocol | typescript-language-server, an LSP adapter | A review of all 55 field reports traced most of them to the adapter: diagnostics one version behind, a dead server behind a live adapter, and two tsservers per daemon. |
| One daemon per workspace | One per package | In a monorepo each daemon ran its own tsserver at 300–800 MB, and one repo loaded the same projects three times. |
| Staying on TypeScript | A Rust rewrite | kiln orchestrates engines that are already native. Rust would save milliseconds of glue and cost iteration speed. |

## The dogfooding loop

kiln checks code that AI writes, so kiln itself has to be trustworthy. My rule for every agent session: when kiln gives an illogical answer, the agent stops, finds the truth another way, and files a field report. Quietly working around a wrong answer is not allowed.

That loop has produced 55 field reports, 49 of them fixed, and found bugs that tests alone had missed:

- **The cold window.** Right after start-up, before the language server had loaded the project, kiln could return a confident `0` references or a false "no errors". kiln never asked the server to report load progress, so it fell back to a fixed 2.5-second wait. Fixed by declaring the missing capability, so answers now wait for real project-load progress.
- **Stale diagnostics.** After an edit, `kiln errors` could return the result from before the edit. Fixed by requiring fresh analysis after every file sync, and failing loudly (exit code 3) otherwise.
- **`$` in file paths.** The language server encodes `$` as `%24`, so every dynamic route file in a TanStack Router app (about 20 of 45 files in one repo) silently got no diagnostics. Fixed by keying diagnostics by the decoded path.
- **The adapter.** Reviewing all 55 reports together showed that most traced to one layer: the adapter between kiln and tsserver. It merged diagnostics without versions, kept answering while its tsserver was dead, and loaded every project twice. I removed it, and kiln now drives tsserver directly. A reference search across one monorepo fell from 98 seconds to 5, and back-to-back checks after an edit came back correct 16 times out of 16, at about 200 ms instead of 470.
- **The project boundary.** `refs` silently left out files outside the TypeScript project, such as excluded test folders. In the first field report, that hid a test that compared a value with itself, and a dead default shipped behind it. Fixed by labelling the boundary on every result, so a partial answer never looks complete.

## Outcome

- **Real use:** 3,492 calls by my agents in 94 project folders between July and November 2026. The most used commands: `errors` 2,779, `refs` 435, `outline` 160, `map` 47.
- **Measured accuracy:** on an aliased-import benchmark, kiln found the aliased call; `rg -w` missed it and returned 3 false matches.
- **Size:** about 13,000 lines of TypeScript, 250 tests (unit, plus integration tests against real language servers, debuggers and a browser), and 40 dated design decisions with reasons.
- **Languages:** TypeScript/JavaScript and Python, for both code questions and runtime debugging.

## Open problems

Two field reports are open, and both are about `kiln errors` across monorepo packages: a stale signature for a function changed in a sibling package, and an export that `tsc` resolves but kiln reports as missing. They come from the two causes the adapter review left standing, kiln's own disk scan and its model of tsconfig files. tsserver can now report both itself, so that is the next change, and it comes before the public release.

I'm also building benchmarks that measure task outcomes (fewer wrong edits, fewer missed callers), not just single-query accuracy.
