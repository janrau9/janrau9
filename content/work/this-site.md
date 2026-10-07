---
id: proj.this-site
title: janrau.dev
subtitle: A portfolio built as a system, with a tailored page for every job application
status: live
statusNote: In daily use for my own job search. Visitor numbers will appear here once real recruiters, not my own checks, have opened links.
period: 2026-10 – present
role: Solo. I designed the system and directed the work; AI coding agents wrote much of the code under my review.
stack: [TypeScript, Astro, Cloudflare Workers, D1, KV, Cloudflare Access, Zod, Typst, Playwright]
url: https://janrau.dev
repo: https://github.com/janrau9/janrau9
draft: false
---

## The problem

A recruiter spends about 30 seconds on a candidate; a hiring manager a few minutes. A general portfolio makes both of them do the matching: is this person a fit for *our* role? Most don't do it.

So every application I send gets its own private page: the job's requirements quoted next to my evidence, the three most relevant projects, a short cover note, and a matching CV. The page you are reading is the public part of that system.

## Constraints

- **No invented claims.** A tailored page may select and order what I've done, never add to it.
- **Nothing leaves without my approval.** Drafts are staged privately and published by hand.
- **Private by default.** Where I apply never appears in this public repository; links are unguessable and not indexed.
- **No running cost per visitor.** No visitor ever triggers an AI model call; hosting stays on Cloudflare's free tier.
- **One maintainer.** Boring tools, every decision written down, CI as the safety net.

## How an application travels

1. I paste a job post, or its link, into Claude Code with `/apply`. It works on my laptop and in a cloud session in the Claude app.
2. The fetch ladder reads the post with the cheapest reliable method: the applicant tracking system's public API, then the page's embedded job data, then its main text, then a real browser. A blocked page is never fought; the answer is "paste the text".
3. An AI coding agent drafts a *variant*: which of my CV items answer which requirements, three projects, a three-paragraph cover note, and answers to the form's own questions.
4. The validator checks it. Every requirement and company fact must be quoted word for word from the post, every claim about me must cite an item in `cv.yaml`, every number must appear in a cited item, a count must match its list, and generic phrases fail.
5. Staging sends the variant, the post and three PDFs (rendered with Typst) to a Cloudflare Worker, which validates again against the CV it was built with and stores everything unpublished in D1 and KV.
6. I review the exact page at a private address behind Cloudflare Access, download the CV and cover letter, and press Publish.
7. When someone opens the link, the Worker records whether it looks like a person or a link scanner, without storing IP addresses or cookies. My dashboard shows who read what.

## Decisions

| I chose | Over | Because |
|---|---|---|
| One content file (`cv.yaml`) validated in CI | A CMS, or facts copied into each page | Every output (site, PDF, README, tailored pages) is generated from it, so none can drift. |
| Tailored pages rendered on a Worker from D1 | Rebuilding the site per application | A new link is live in seconds, and applications never enter the public build. |
| PDFs in KV | R2 object storage | R2 needs a payment method on the account; KV is free and holds them easily. |
| Staging through the site with a Cloudflare Access service token | Local files, or a Cloudflare API token in cloud sessions | Any surface can continue an application, and the token can reach the admin area but nothing else. |
| AI only where I trigger it, reviewed before publishing | A chatbot or AI features for visitors | No per-visitor cost, and nothing reaches a recruiter that I haven't read. |

The full reasoning lives in three architecture decision records in the repository.

## What the guardrails caught

Most of the value of this system is in what it refused to let through. Each of these was caught by a test, a check or a review step before or right after it reached production:

- **YAML silently truncating skills.** The schema validator's first run found three skill names cut off at a comma. (`8a951ef`)
- **My design system failing its own rule.** An accessibility test measured Seiza's small grey text at 4.46:1, under the 4.5:1 minimum. Fixed by one step of lightness. (`bcf5aed`)
- **The security policy breaking production.** A strict Content Security Policy silently blocked the build's inlined scripts and fonts; the theme toggle did nothing live. A test now applies the real policy in the browser. (`814dc5e`)
- **Job boards escaping HTML twice.** Greenhouse's API arrives double-escaped, caught by a fixture test while building the fetcher; Teamtailor's embedded data does too, caught by the first real fetch, which produced raw tags. (`654fc02`, `d666a90`)
- **A count that didn't add up.** A cover note promised "6 ways" and listed five. A check now compares every count with its list. (`acdf075`)
- **An overclaim the validator couldn't see.** A draft said 39 bug reports were "each one a fix"; 27 were still open. Every number was grounded, the sentence wasn't. The human review step exists for this.
- **A cloud proxy behind a bare 403.** Staging failed from cloud sessions while `curl` worked: Node's `fetch` ignored the sandbox's HTTPS proxy. The CLI now uses it, and failures name the layer that refused. (`9687519`)
- **Red reading as a status.** My design system's one red mark sat beside "Available" and read as "not available". It moved into the dot of the j in my name. (`d30ad00`)
- **Tests racing each other.** Two test servers shared one local database file and locked it. (`b5f6b8c`)

## Outcome

- **In use:** 5 applications prepared and published so far, each with its own page, CV and cover letter.
- **Fetching:** the first four posts fetched automatically needed three different methods: an applicant tracking system's API, embedded job data, and a real browser for a JavaScript-only page.
- **Quality gates:** about 130 automated tests, including WCAG 2.2 AA accessibility in both colour themes, a page-weight budget and the production security policy, run on every push; a deploy happens only when all pass.
- **Cost:** hosting on Cloudflare's free tier; the only bill is the domain.

## What's next

Real numbers from real visitors: how many links are opened by a person rather than a scanner, and which applications lead to a conversation. They'll appear here when there is something true to report.
