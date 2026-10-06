# PRD: Per-application portfolio

> Product requirements. The build spec is in [SPEC.md](SPEC.md).
> Status: draft for review. Items marked **DECIDE** need Janrau's answer.

## 1. Problem

Janrau is applying for software engineering jobs at junior to mid level, in Helsinki and remote across the EU. Each opening gets many applicants. A recruiter spends about 30 seconds on a candidate and a hiring manager 2–5 minutes. A generic portfolio makes both readers do the matching work themselves, and most won't.

Engineering roles are blurring (one engineer covers frontend, backend, deployment and AI), but hiring still filters on a title and a stack. Janrau needs to show range without looking unfocused.

## 2. Product in one sentence

Janrau pastes a job post. The system builds a private page and PDF CV for that one application, showing how Janrau's real experience matches the post, and reports when a real person opens it.

## 3. Positioning

- **Title:** Software Engineer. It matches the most job ads and applicant-tracking searches.
- **Subline (specific):** chosen per application from approved headlines in `cv.yaml`. Candidate for the home page: "real-time, local-first and edge systems" (open question 4).
- **Edge:** an engineer who uses AI and verifies it. Proof: kiln (Janrau's own code-intelligence tool, used to check AI-written code) and its field-report loop, which has caught real bugs.
- **Current role:** Integrations Developer at a localization SaaS startup in Helsinki. The employer is not named publicly for now; the name is shared on request (interviews, reference checks). No case study page and no links to employer code or packages. Highlights describe the kind of work only.
- **Recurring strength (proposed):** real-time, local-first and edge systems. Slash, ShotClock and synchd each derive state from an append-only event log and sync it live across devices; the current job adds a multi-tenant edge proxy on Cloudflare Workers.
- **Education:** Hive Helsinki. The public Hive repos (`minishell`, `philosophers`, `Inception`, `transcendence` and others) are the old portfolio; they move to the education section as supporting evidence (processes, threads, Docker, teamwork), not featured work.
- **AI stance:** visitors never trigger an LLM call. AI runs only where Janrau triggers it, and Janrau reviews every output.

## 4. Users

| User | Context | What they need | Time |
|---|---|---|---|
| **Janrau (operator)** | Finds jobs on LinkedIn, by email, on company sites | Turn a post into a tailored link in minutes; know what happened next | Minutes per application |
| **Recruiter** | Opens the link from an application or message, often on a phone | Role, location, work rights, availability, CV download | ~30 s |
| **Hiring manager / tech lead** | Decides on the interview | Evidence that Janrau has solved problems like theirs | 2–5 min |
| **Interviewer** | Prepares questions | Case studies and decisions to discuss | Later |

## 5. Goals and success metrics

All targets are proposals. **DECIDE** whether they are right.

| Goal | Metric | Target |
|---|---|---|
| Get interviews | Interviews ÷ applications sent with a link | Track from day 1; compare against applications without a link |
| Fast operator workflow | Time from paste to approved link | ≤ 3 min |
| Pages get read | Human opens ÷ links sent | Track; follow up when a link is opened |
| Recruiter finds the essentials | Role, location, work rights and CV button visible without scrolling on a 375 px wide phone | 100 % of pages |
| Fast on phones | Largest Contentful Paint on a mid-range phone, 4G | < 1.5 s |
| No invented claims | Published items not traceable to `cv.yaml` | 0 |
| Cheap | Running cost | ≤ €5/month excluding domain |

## 6. Non-goals (for now)

- Kubernetes, a platform lab, or event pipelines for their own sake. Revisit only when targeting platform roles.
- Visitor-facing AI: chat, in-browser models, semantic search.
- Fault-injection panels, X-ray overlays, decorative system animations.
- Detecting visitor role by IP, fingerprinting or behaviour.
- Bypassing bot protection on job sites.
- Auto-applying to jobs.

## 7. User stories

### Operator (Janrau)

1. I paste the text of a job post, and I get a draft tailored page and PDF.
2. I paste a URL. The system fetches the post if it can. If it can't, it tells me why and asks for the text.
3. I review the draft. I can reorder, remove or swap items, edit the cover note, and regenerate. I also see which requirements I don't match, privately. Nothing is published until I approve.
4. On approval I get a link like `janrau.dev/for/acme-k7f3q` that is live at once.
5. Pasting the same job twice is detected.
6. The original post is saved, so I can reread it before an interview after the company takes it down.
7. I see, per application: sent, opened by a human, fit table viewed, CV downloaded.
8. I record the outcome: applied, interview, rejected, offer, no reply.
9. I see a funnel across all applications.
10. Later: I can do all of this from my phone.

### Recruiter

11. Without scrolling, I see the role-matched headline, location, work rights, availability and a CV download.
12. The PDF matches the page and parses cleanly in our applicant tracking system.
13. No cookie banner gets in my way.

### Hiring manager

14. I see each requirement from our post next to concrete evidence, each linked to proof.
15. I see the 3 most relevant case studies first.
16. If I'm curious, I can find out how this page was generated.
17. I read a short, specific cover note: why this role, why Janrau fits, and how they work. Every claim in it is backed by the CV.

## 8. Requirements

### Functional

| ID | Requirement |
|---|---|
| F1 | Accept pasted text and URLs. Recognise LinkedIn URLs and ask for text immediately. |
| F2 | Fetch URLs with the fetch ladder (SPEC §5). Never evade blocks. |
| F3 | Extract company, role, location, language, requirements, nice-to-haves into a validated schema. |
| F4 | Match by ID only: the LLM selects and orders `cv.yaml` items; every ID is validated. |
| F5 | Each fit-table requirement is quoted from the post text, and each piece of evidence is a `cv.yaml` item. |
| F6 | Mandatory review step before publishing. |
| F7 | Publish to an unguessable `noindex` URL, live without a site rebuild. |
| F8 | Render a matching tailored PDF. |
| F9 | Snapshot the raw post and deduplicate. |
| F10 | Record events and separate human opens from scanners. |
| F11 | Private dashboard: applications, events, status, funnel. |
| F12 | Public home page and case studies for visitors without a tailored link. |
| F13 | Every tailored page has a 3-paragraph cover note from a fixed template (SPEC §6). Claims about Janrau cite `cv.yaml` IDs; facts about the company come from the post. |
| F14 | Unmatched requirements are shown to Janrau in review and never on the public page. |
| F15 | English only. |

### Non-functional

| ID | Requirement |
|---|---|
| N1 | Privacy: application data never appears in the public repo. No IPs stored, no cookies. |
| N2 | Availability: if a variant can't load, show the general page and CV, never an error page. |
| N3 | Accessibility: semantic HTML, keyboard navigation, visible focus, reduced motion respected. |
| N4 | Performance: phone-first single column, no layout shift, LCP target above. |
| N5 | Maintainability: one maintainer. Boring tools, ADRs for every non-trivial choice. |
| N6 | Code in a public repo: tests, small commits, clear README. |
| N7 | Cost: visitors never cause LLM calls; total ≤ €5/month. |

## 9. Release plan

| Release | Contents | Usable for job hunting? |
|---|---|---|
| R1 | Real content, home page, case studies, general PDF | Yes: send the general link |
| R2 | Tailored pages, variants written by hand | Yes: first tailored links |
| R3 | Paste pipeline from the laptop | Yes: links in minutes |
| R4 | Tracking and funnel | Yes: know who opened |
| R5 | Phone workflow | Convenience |
| R6 | "How this works" case study from real data | Showcase |

R1 ships first, because content is the bottleneck and a plain portfolio already helps.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Content stays unwritten while code grows | R1 needs real content; phase 0 is content |
| LLM picks a weak or wrong match | Mandatory review; ID validation; quoted requirements |
| Tailoring reads as manipulative | Label "Prepared for Acme" openly; content is never rewritten |
| Job sites block fetching | Paste-first; fetch from the laptop; stop at the first block |
| Scanners inflate opens | Human beacon (SPEC §8) |
| Job search becomes visible publicly | Private data store; random slugs; `noindex` |
| Too much system, too little job hunting | Each release is usable on its own; stop at any release |
| Cover note sounds generic or overclaims | Fixed 3-question template; every claim cites a `cv.yaml` ID; mandatory review |
| Cloudflare free daily limits hit (D1 now enforces them) | Usage is far below limits (SPEC §2); fallback to the general page if D1 errors |

## 11. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Cover note | Yes. 3 paragraphs from a fixed template, grounded in `cv.yaml` (SPEC §6). |
| 2 | Language | English only. |
| 3 | Domain | `janrau.dev` |
| 4 | Sources for fetch adapters | Janrau sends 5–10 job links before phase 3. |
| 5 | Case studies | Write one for each project; the matcher features the top 3 per application (SPEC §7). Nurho is removed from the CV. |
| 9 | Employer | Anonymous: "Integrations Developer at a localization SaaS startup". Name on request. |
| 10 | Title | "Software Engineer", with a specific subline per application. |
| 11 | Old portfolio | Retired. Hive public repos move to the education section. |
| 12 | Featured three (home page) | Slash, kiln, Sisu Shift: real-time sync, developer tooling, mobile + optimisation. synchd can replace Slash per application. |
| 13 | Repo visibility | kiln goes public after a secret scan of its full history. All other projects: code shown on request. |
| 6 | Success targets (§5) | Accepted. |
| 7 | Gaps row | Default: unmatched requirements appear only in the private review, never on the public page. Revisit after 10 applications. |
| 8 | Hosting | Cloudflare free tier: Workers (with static assets, not Pages), D1, R2, Access, Web Analytics (SPEC §2). |

## 12. Open questions

1. **Home page subline.** "Real-time, local-first and edge systems", or decide after the first 10 applications show which tailored headlines get opens.
2. **`nurho-studio`** is a public repo. Make it private now that Nurho is off the CV?
