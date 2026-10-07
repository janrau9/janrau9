# Spec: Per-application portfolio

> Build brief for Claude Code. The product requirements are in [PRD.md](PRD.md).
> Replaces the earlier `PORTFOLIO_SPEC.md`.
>
> Work one phase at a time. Stop at the end of each phase, summarise what changed, and wait for review before starting the next.
> Items marked **TODO (Janrau)** need Janrau's input. Ask instead of guessing.

## 1. Goal

Turn a pasted job post into a tailored page and PDF CV at a private link, and report when a real person opens it. The site also serves a general portfolio for visitors without a link.

The repo is public and is part of the portfolio. Application data is not, and never enters the repo.

## 2. Constraints

If a choice conflicts with one of these, raise it.

| Constraint | Rule |
|---|---|
| Budget | ≤ €5/month excluding the domain. Cloudflare free tiers first. |
| No invented claims | Published content only references IDs in `cv.yaml`. Fit-table requirements are quoted from the post. Validate every LLM response. |
| Human approval | Nothing tailored is published without Janrau's approval. |
| Visitor cost | Visitors never trigger an LLM call. |
| Privacy | Application data stays out of the public repo. No IPs stored, no cookies, no consent banner needed. |
| Always available | If a variant fails to load, serve the general page and CV. |
| Fetching ethics | One user-initiated request, honest user agent. Never evade blocks, solve CAPTCHAs or rotate proxies. |
| Mobile | Phone first. LCP < 1.5 s on a mid-range phone on 4G. No layout shift. |
| Accessibility | Semantic HTML, keyboard navigable, visible focus, respects reduced motion. |
| Maintainability | One maintainer. Boring, documented tools. ADR for every non-trivial choice. |
| Language | English only. |

### Hosting cost: Cloudflare free tier

Checked October 2026 against the Cloudflare docs. Re-check before launch.

| Service | Free allowance | Expected use |
|---|---|---|
| D1 | 5 M rows read/day, 100 k rows written/day, 5 GB storage (500 MB per database). Since 2026-09-01, queries fail once the daily limit is hit, until 00:00 UTC. | Tens of writes and a few thousand reads per day |
| R2 | 10 GB-month storage, 1 M Class A (writes) and 10 M Class B (reads) operations per month, free egress | A few MB of PDFs and snapshots per month |
| Workers | 100 k requests/day; static asset requests are free | Hundreds per day |
| Cloudflare Access | Free for small teams | 1 user |
| Web Analytics | Free | — |
| Domain `janrau.dev` | Not free: registrar price per year | — |

Expect Cloudflare to ask for a payment method when enabling R2, even within the free tier. The fallback in §3 covers D1 limit errors.

## 3. Architecture

### Components

```
Laptop (operator)                         Cloudflare (public)
┌──────────────────────────┐             ┌──────────────────────────────────┐
│ Claude Code  /apply      │             │ Astro site (Workers + assets)    │
│   ├─ ingest  (fetch ladder)            │   /            general home      │
│   ├─ extract (Claude, in session)      │   /work/:id    case studies      │
│   ├─ match   (Claude, in session)      │   /for/:slug   tailored page ◄── D1
│   ├─ validate (CLI, Zod + ID checks)   │   /cv.pdf      general CV        │
│   ├─ review  (local preview)           │   /for/:slug/cv.pdf  ◄── R2      │
│   ├─ render PDF (Typst)  │  publish    │   /e           event beacon ──► D1│
│   └─ publish ────────────┼───────────► │   /admin       dashboard (behind │
└──────────────────────────┘  admin API  │                Cloudflare Access)│
                                         └──────────────────────────────────┘
```

### Data stores

| Store | Holds | Public? |
|---|---|---|
| Repo: `content/` | `cv.yaml`, case studies, ADRs | Yes |
| D1 (SQLite) | applications, variants, events | No |
| KV (key-value store) | tailored PDFs (`cv:<slug>`), raw post snapshots (`post:<slug>`) | No (PDFs served only via their slug). KV, not R2: ADR-002 |

### Request paths

```
Tailored page
  Browser → /for/:slug → Function loads variant from D1 → render with the same
  components as the static pages → HTML (noindex)
  On D1 failure or unknown slug → general home page, HTTP 200 for failures, 404 for unknown slugs

Event
  Page → beacon POST /e {slug, type} → Function classifies human vs scanner → insert into D1
  IP and user agent are used at classification time, then discarded

Publish
  CLI → POST /admin/api/applications (Cloudflare Access service token) → D1 row + R2 PDF
```

### Repo layout

```
repo
├── content/
│   ├── cv.yaml              # single source of truth
│   ├── work/*.md            # case studies
│   └── adr/*.md
├── apps/
│   ├── site/                # Astro: static pages + /for, /e, /admin functions
│   └── cli/                 # `apply` CLI used by the /apply command
├── packages/
│   ├── schema/              # Zod: cv.yaml, job post, variant, event
│   ├── ingest/              # fetch ladder + extractors + fixtures
│   └── cv-pdf/              # Typst templates
├── .claude/commands/apply.md  # the /apply slash command
└── infra/                   # wrangler config, D1 migrations, CI
```

## 4. Tech choices

Defaults. Each gets an ADR. Suggest an alternative if a default is clearly worse.

| Area | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces, TypeScript | One language across site, CLI and schema |
| Schema | Zod, plus generated JSON Schema for editor validation of `cv.yaml` | Shared by site, CLI and API |
| Site | Astro on Cloudflare Workers: static assets plus on-demand routes for `/for`, `/e`, `/admin` | One codebase for static and dynamic; Cloudflare's recommended target for new projects |
| Design | Seiza design system | Dogfooding. The one vermilion seal marks availability (home) or project status (case study), never a button: Seiza's seal law |
| Data | Cloudflare D1 + R2 | Free tier, private, no server to run |
| Admin auth | Cloudflare Access (free tier) | No custom auth code |
| PDF | Typst | Millisecond compiles, reads YAML/JSON directly, little escaping, WASM build exists |
| LLM, laptop path | Claude inside the Claude Code session running `/apply` | €0 extra |
| LLM, phone path (phase 5) | Claude API, small model, hard monthly cap | Cents per application |
| HTML extraction | Mozilla Readability | Proven main-content extraction |
| Headless fetch | Playwright, local only | Laptop has a residential IP |
| General traffic analytics | Cloudflare Web Analytics | Free, cookieless, no maintenance |
| Application analytics | Own events table (§8) | Needs joins with application data and scanner filtering |

## 5. Ingestion

### Inputs

| Input | Handling |
|---|---|
| Pasted text (LinkedIn, email, anything) | Used directly. Primary path. |
| URL | Fetch ladder below |
| LinkedIn URL | Refuse to fetch. Ask for text, and suggest the "Apply on company website" URL. |
| PDF, screenshot, `.eml` | Later |

### Fetch ladder

Stop at the first step whose output passes the quality gate.

1. **ATS adapter.** Detect the applicant tracking system from the URL and call its public posting API. Candidates: Greenhouse, Lever, Ashby, Recruitee, Teamtailor, Workable, SmartRecruiters. Build only adapters for sources Janrau actually uses (**TODO (Janrau)**: send 5–10 recent job links). Verify each API against live data when building it.
2. **JSON-LD.** Fetch HTML, parse `<script type="application/ld+json">` blocks with `@type: JobPosting`.
3. **Readability.** Extract main text from the static HTML.
4. **Headless.** Render with Playwright and repeat steps 2–3.
5. **Ask for paste**, with the reason: blocked, login wall, challenge page, or too little text.

**Quality gate:** title present, company present, description ≥ 300 characters. Not a challenge page (detect phrases like "Just a moment", "Enable JavaScript", "verify you are human", and HTTP 403/429).

**Provenance:** record which step succeeded, the final URL and the fetch time.

**Findings from 13 real job sites (2026-10-05; details in the private `research/jobs/`):**

| Host | Ladder step that worked | Notes |
|---|---|---|
| Greenhouse (embedded on own site) | 2, JSON-LD in plain HTML | One fetch tool saw an empty page; a plain HTTP GET returned the full post. Try a plain GET before headless. |
| Greenhouse (boards.greenhouse.io) | 3, Readability | No JSON-LD on hosted pages. Greenhouse's job-board API is the step 1 adapter. |
| Ashby | 2, JSON-LD | JSON-LD can be wrong: one post was tagged `TELECOMMUTE` while its text said hybrid. |
| Teamtailor, The Hub, Jobly | 2, JSON-LD | |
| Duunitori | 2, JSON-LD | Title and company fields wrong; fill them from the text. |
| Workday | 2, JSON-LD | Closed posts return 403. |
| Oracle Recruiting Cloud | 1 (public REST API) or 4 | JSON-LD only after JavaScript runs. |
| Notion page | 4, headless | JavaScript-only. |
| LinkedIn | — | Logged-out pages returned JSON-LD, but the rule stands: no fetching LinkedIn (terms of service). Paste text. |

Rules from this:
- **Never trust JSON-LD alone.** Cross-check location, remote status, title and company against the post text; on conflict, the text wins and the review screen shows the conflict.
- **Adapters to build first:** Greenhouse, Ashby, Workday, Teamtailor. Then generic JSON-LD, then headless.

### After ingestion

1. **Snapshot** raw text (and HTML if fetched) to R2.
2. **Deduplicate** with a hash of the normalised URL and normalised text. Warn on match.
3. **Extract** into `JobPost` (Zod): `company, role, location, remote, language, requirements[], niceToHaves[], source`. Steps 1–2 of the ladder fill fields directly; otherwise Claude extracts them. Every `requirements[]` entry must be a substring of the post text after whitespace normalisation, or it is rejected.

### Testing

Fixture corpus in `packages/ingest/fixtures/`: saved API responses and HTML per source, plus a challenge page, a login wall and an empty SPA shell. Each extractor is tested against its fixtures. A site layout change means: add a fixture, fix the extractor.

## 6. Matching and review

### Matching

Input: the `JobPost` plus a compact list of `cv.yaml` items (ID + text + tags).

Output (Zod `Variant`):

```ts
{
  headlineId: string,                  // from cv.yaml headlines[]
  fit: { requirement: string, evidenceIds: string[] }[],   // max 6 rows
  projectIds: string[],                // ordered, max 3 featured
  highlightIds: string[],              // ordered
  skillIds: string[],                  // ordered, relevant first
  gaps: string[],                      // unmatched requirements; review only, never published
  coverNote: {                         // see "Cover note" below
    whyRole:   { text: string, postQuotes: string[] },
    whyMe:     { text: string, evidenceIds: string[] },
    howIWork:  { text: string, evidenceIds: string[] }
  }
}
```

Validation:
- every ID exists in `cv.yaml`
- no duplicates
- limits respected
- each `requirement` is quoted from the post (§5)
- unmatched requirements are dropped, never padded

Invalid output: one retry with the validation errors fed back, then stop and show the errors.

### Cover note

Three paragraphs, each answering one fixed question:

| Paragraph | Question | Grounded in | Length |
|---|---|---|---|
| 1. `whyRole` | Why this role and company? | Quotes from the post (`postQuotes`) | 2–3 sentences |
| 2. `whyMe` | Why do I fit? | 2–3 `cv.yaml` items (`evidenceIds`) matching the top requirements | 3–4 sentences |
| 3. `howIWork` | How do I work, and what happens next? | 1–2 `cv.yaml` decisions or highlights; closing line with a call to talk | 2–3 sentences |

Rules:
- Every claim about Janrau must be backed by an item in `evidenceIds`. Validation checks that the IDs exist and that each paragraph cites at least one.
- Every fact about the company must come from `postQuotes`, each a substring of the post. No outside facts about the company.
- No numbers that don't appear in the cited `cv.yaml` items.
- Banned phrases list in `packages/schema` (e.g. "passionate", "I am excited to apply", "fast-paced"). A hit fails validation.
- Total ≤ 180 words.
- Review shows each paragraph next to the items it cites, so unsupported sentences are easy to spot.

### Review

`apply` opens a local preview of the page and the PDF. Janrau can reorder, remove, swap items, edit the cover note, regenerate, or abort. The preview also lists `gaps`, the requirements with no matching evidence; they are useful for interview prep and never published. Approval publishes.

### Publish

- Slug: `<company-kebab>-<5 random base32 chars>`, e.g. `acme-k7f3q`.
- Write the application and variant to D1; upload the PDF and snapshot to R2.
- Print the URL. Live immediately.

## 7. Pages

### Tailored page `/for/:slug`

Sections in order:

1. **Header.** "Prepared for {company} · {role}" label; name; headline from `headlineId`; location, work rights, availability; primary button "Download CV (PDF)"; email, GitHub, LinkedIn.
2. **Fit table.** "You asked for → What I've done". Each row links to its proof.
3. **Most relevant work.** 3 cards: problem, role, stack, outcome, link.
4. **Why {company}.** The 3-paragraph cover note (§6). Also included in the tailored PDF.
5. **Experience** (compact) and **skills** (relevant first).
6. **Footer.** "This page was generated for this application by my own pipeline. How it works →"

Rules:
- Above the fold on a 375 px wide screen: label, name, headline, location/work rights/availability, CV button.
- `<meta name="robots" content="noindex">` and `X-Robots-Tag: noindex`.
- Page and PDF render from the same variant, in the same order.
- Print stylesheet.
- No cookies, no cookie banner.
- The link stays live after the job closes.

### Home `/`

Same template, without tailoring:
- two entry points: "60-second overview" and "Engineering deep dive"
- 3–4 core strengths with proof instead of the fit table
- all case studies

### Case studies `/work/:id`

Format: problem, constraint, my role, decisions (chose / over / because), outcome, what I'd do differently.

One case study per project. The matcher picks the 3 most relevant per application; the home page shows a default 3 (Slash, kiln, Sisu Shift). The current job has no case study page (anonymous employer, PRD §3).

| Project | What it is | Evidence it carries |
|---|---|---|
| Slash | Darts tournament PWA: double-elimination bracket, three phones per match synced live | Real-time sync (Zero), append-only event log, Hono + Bun |
| ShotClock | Grassroots basketball league PWA for the Philippines | Event-sourced stats, sync engines, Cloudflare Workers + Hetzner |
| synchd | Local-first chord charts with live band sessions on one beat grid | Local-first (PowerSync), timing engine, deterministic parser |
| Sisu Shift | Auto-scheduling and pay calculation for Finnish healthcare teams | Mobile (Expo), CP-SAT optimisation, EU constraints |
| rhythm | Personal goal system with a mentor voice: Telegram bot + Expo PWA | Postgres + pgvector, AI memory design |
| kiln | Code-intelligence CLI for coding agents | Language servers, debugger protocols, dogfooding loop |
| Seiza | Personal design system | Design tokens, theming, accessibility |
| transcendence (Hive) | Team web game, 4 people | Teamwork; remote players, database, user management. Education section, not featured. |

Only kiln's case study links to a public repo. Every other case study shows screenshots and a "Code available on request" note with a contact link.

Before kiln goes public: scan its full git history for secrets (e.g. `gitleaks`), rotate anything found, add a licence and check the README.

Order of writing: the default featured three first, then the rest.

### How it works `/work/this-site`

The pipeline itself as a case study, written in phase 6 from real data: ingestion success rates by ladder step, scanner vs human opens, funnel numbers, kiln bugs found while building.

## 8. Events and analytics

### Table

```sql
events(
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL,
  type TEXT NOT NULL,      -- open | human | fit_viewed | cv_download | case_click
  ts INTEGER NOT NULL,
  human INTEGER NOT NULL   -- 0 or 1
)
```

### Human vs scanner

1. Server-side `open` on every page request (scanners included).
2. Client beacon `human` once the page has been visible ≥ 3 s, or on the first scroll or click.
3. Opens within 60 s of publish from a datacenter network (Cloudflare `request.cf.asn` on a list) are marked as suspected scanners.
4. Only `human` events count as opens in the dashboard.

IP and user agent are read at classification time and never stored.

### Dashboard `/admin`

Behind Cloudflare Access. Lists applications with status, last human open and CV downloads. Funnel: published → human open → CV download → interview → offer. Status is editable: `draft | applied | interview | rejected | offer | no_reply`.

### General traffic

Cloudflare Web Analytics on `/` and `/work/*` only, not on `/for/*`.

## 9. Data model

### `cv.yaml` (draft)

**TODO (Janrau):** real content.

```yaml
person:
  name: Janrau
  location: Helsinki, Finland
  workRights: ""          # TODO, e.g. "EU citizen"
  availability: ""        # TODO
  links: { github: "", linkedin: "", email: "" }

headlines:                # approved headlines the matcher chooses from
  - id: hl.default
    text: Software Engineer — real-time, local-first and edge systems   # TODO confirm
  - id: hl.product
    text: Software Engineer — mobile, web and AI
  - id: hl.mobile
    text: React Native engineer — offline-first mobile apps

skills:
  - id: skill.react-native
    name: React Native / Expo
    tags: [mobile, frontend]

experience:
  - id: exp.current
    org: Localization SaaS startup, Helsinki   # employer not named publicly
    role: Integrations Developer
    start: ""             # TODO, YYYY-MM
    end: null
    highlights:
      - id: exp.current.h1
        text: ""          # TODO, one verifiable claim per highlight, no employer internals
        tags: [edge, backend, integrations]

education:
  - id: edu.hive
    org: Hive Helsinki
    programme: ""         # TODO
    start: ""             # TODO, YYYY-MM
    end: ""               # TODO
    projects: [proj.transcendence, proj.minishell, proj.philosophers, proj.inception]

projects:
  - id: proj.sisu-shift
    name: Sisu Shift
    status: building      # live | building | archived
    summary: Auto-scheduling and pay calculation for Finnish healthcare teams.
    stack: [expo, supabase, fastapi, or-tools, claude-api, hetzner]
    caseStudy: work/sisu-shift.md
    decisions:
      - id: proj.sisu-shift.d.solver
        chose: Isolated FastAPI + CP-SAT service capped at 2 workers
        over: Running optimisation inside the main API
        because: Solving is CPU-heavy; isolation keeps the app responsive and costs flat.
        tags: [backend, performance]
```

Rules:
- Every item has a stable `id`. IDs never change once published, because live variants reference them.
- Highlights are single, verifiable claims. Tailoring selects and orders them; it never rewrites them.
- Tags come from a fixed vocabulary defined in `packages/schema`.
- Dates are `YYYY-MM`.

### D1 tables

```sql
applications(slug PK, company, role, source_url, post_hash UNIQUE,
             status, created_at, published_at)
variants(slug PK → applications, variant_json, cv_version)   -- cv.yaml git hash at publish
events(...)                                                  -- §8
```

`cv_version` records which `cv.yaml` a variant was built from. If a referenced ID is later removed, the page drops that item rather than failing.

## 10. PDF

- Typst templates in `packages/cv-pdf`: `general.typ` and `tailored.typ`, sharing components.
- General CV built in CI and served at `/cv.pdf`.
- Tailored CV rendered locally by the CLI in phases 3–4. Phase 5 needs a server path (Typst WASM or similar; ADR).
- Readable by applicant tracking systems: single column, real text, no icons replacing words.
- CI test: `pdftotext` output contains the name, headline and every highlight, in order.

## 11. Phases

### Phase 0: Content, repo, schema

- **TODO (Janrau):** real `cv.yaml` content and the case studies (Sisu Shift, kiln, third TBD). Claude interviews Janrau project by project and drafts them.
- Monorepo scaffold, lint, format, CI (typecheck + tests).
- Zod schema, generated JSON Schema, validator that fails CI on invalid content.
- ADR template; ADR-001 (single source of truth and monorepo).

**Done when:** CI fails on an invalid `cv.yaml` and passes on the real one.

### Phase 1: Static site and general CV (release R1)

- Astro + Seiza: home, case studies.
- Typst general CV in CI, linked from the site, with the `pdftotext` test.
- Cloudflare Workers deploy (static assets), Cloudflare Web Analytics, security headers, CSP.
- Accessibility check (axe) and a page-weight budget in CI.

**Done when:** pushing a `cv.yaml` change updates the site and PDF, and CI blocks on a11y violations or budget overruns.

### Phase 2: Tailored pages from hand-written variants (R2)

- D1 schema and migrations; `/for/:slug` on-demand route; `noindex`; fallback to the home page.
- Variants written by hand as JSON and loaded with a script.

**Done when:** a hand-written variant renders at a random slug, on a phone, with the header above the fold, and a bad slug or D1 failure falls back correctly.

### Phase 3: Paste pipeline on the laptop (R3)

- `/apply` Claude Code command and `apply` CLI.
- Fetch ladder, quality gate, snapshot, dedupe, extraction, matching, validation, local review, tailored PDF, publish via the admin API.
- Cover note generation and validation (§6).
- Fixture corpus and tests.

**Done when:** tests cover each ladder step, challenge page, login wall, LinkedIn refusal, invented ID, unquoted requirement, cover note without evidence, banned phrase, malformed JSON and duplicate post, each with the right behaviour. A real post goes from paste to live link in ≤ 3 min.

### Phase 4: Events and dashboard (R4)

- Event beacon, human classification, `/admin` behind Cloudflare Access, status editing, funnel.

**Done when:** a link opened by an email scanner does not count as a human open, a real phone visit does, and status changes show in the funnel.

### Phase 5: Phone workflow (R5): dropped 2026-10-07

Covered another way, with no new code or API spend: the `apply` skill runs `/apply` in cloud
Claude Code sessions from the Claude app on a phone (ADR-003), and review, attachments and
publishing work from any browser at `/admin`. What this phase would still have added, a paste
form calling the Claude API from `/admin` and Android's share target, isn't worth an API key
and a monthly spending cap for one user. Kept below for the record.


- Paste form in `/admin`, Claude API with a hard monthly cap, server-side PDF rendering.
- Android share target (Web Share Target API). On iOS, paste only.
- Server-side fetching only up to step 3 of the ladder; blocks fall back to paste.

**Done when:** a job found on LinkedIn mobile becomes a live link without the laptop.

### Phase 6: Showcase (shipped 2026-10-07)

`/work/this-site` is live, linked from every tailored page. It reports build facts now; visitor
numbers are added once real recruiters, not Janrau's own checks, have opened links (his
signed-in visits are no longer recorded).


- `/work/this-site` written from real numbers.
- Footer link on tailored pages goes live.

**Done when:** the case study cites real numbers from D1 and links to the ADRs.

## 12. Engineering rules

- ADR for every non-trivial choice in `content/adr/`: context, decision, alternatives, consequences.
- Tests for the schema validator, every extractor, match validation, every fallback path and the PDF text check.
- No secrets in the repo; `.env.example` documents every variable.
- Measure page weight and report it when it changes significantly.
- Small commits with clear messages; the history is public.
- Built with Seiza and kiln. kiln problems found while building go to the field-report log; notable ones feed the phase 6 case study.
- Repo has a licence, a README, and no application data.

## 13. Open decisions (ADRs to write)

- Slug format and length.
- Server-side Typst for phase 5: WASM in a Function versus another route.
- Datacenter ASN list for scanner detection: source and upkeep.
- Event retention period.
- Whether `/for/*` pages expire.
- Whether to publish a "gaps" row on tailored pages. Default: no. Revisit after 10 applications.

## 14. Later, out of scope

- Visitor-facing semantic search with build-time embeddings and an in-browser query model.
- Kubernetes platform lab with game days, only if targeting platform roles.
- Own pipeline for general traffic analytics.
- PDF, screenshot and `.eml` inputs.
- Interview scheduling.
