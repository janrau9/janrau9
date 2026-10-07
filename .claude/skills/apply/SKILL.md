---
name: apply
description: Turn a job post (URL or pasted text) into Janrau's tailored application on janrau.dev — fit table, 3-paragraph cover note, CV and cover-letter PDFs, answers to the form's questions — staged for review, published only on approval. Use when Janrau shares a job post, a job URL, or says "apply", "tailor", "draft an application", or names a company and role to apply for. Works on the laptop and in cloud Claude Code sessions.
---

# Apply: job post → tailored link

Everything a tailored page says about Janrau must come from `content/cv.yaml`, cited by ID.
Everything it says about the company must be quoted from the post. The validator enforces
both; your job is to choose well. **Nothing is published without Janrau's explicit yes.**

Work in a folder per application under `private/drafts/<company>/` (gitignored: it holds
where Janrau applies, which must never be committed).

## 1. Get the post

- URL: `pnpm job fetch <url> private/drafts/<company>`
  - LinkedIn is refused by design. Ask Janrau to paste the text or the "Apply on company website" link.
  - If it fails ("Paste its text instead"), show the listed attempts and ask for the text.
- Pasted text: save it to `private/drafts/<company>/post.txt`, then
  `pnpm job paste private/drafts/<company>/post.txt private/drafts/<company> --company "<Company>" --role "<Role>"`
- Read `post.json`. Report any `conflicts` (structured data vs. text): the text wins.
- Ask Janrau for the application form's own questions and character limits, if any.

## 2. Draft `private/drafts/<company>/variant.json`

Read `content/cv.yaml` for citable IDs (highlights, projects, decisions, skills, awards) and
`content/work/*.md` for context. Shape (validated by `packages/schema/src/variant.ts`):

```json
{
  "company": "…", "role": "…", "sourceUrl": "…",
  "headlineId": "hl.default",
  "fit": [{ "requirement": "<quoted word for word from the post>", "evidenceIds": ["…"] }],
  "projectIds": ["proj.…", "proj.…", "proj.…"],
  "skillIds": ["skill.…"],
  "gaps": ["requirements with no evidence: private, never published"],
  "coverNote": {
    "whyRole":  { "text": "…", "postQuotes": ["<quoted from the post>"] },
    "whyMe":    { "text": "…", "evidenceIds": ["…"] },
    "howIWork": { "text": "…", "evidenceIds": ["…"] }
  },
  "formAnswers": [{ "question": "…", "limit": 200, "answer": "…", "evidenceIds": ["…"] }]
}
```

Rules (Janrau's, learned from real applications):

- **Fit table:** up to 6 rows, the post's most important requirements, each quoted exactly.
  Evidence may include side projects and LLM work: the table shows range.
- **Headline:** pick from `headlines` in cv.yaml to match the role (`hl.default` is
  TypeScript/React/Python; `hl.integrations`, `hl.product`, `hl.tooling`, `hl.realtime`).
- **Projects:** the 3 that best answer this post's problems.
- **Cover note:** 3 paragraphs, 180 words at most. whyRole = why this company and role, from
  the post. whyMe = the strongest evidence for *their* problem. howIWork = how Janrau works
  (designs and directs; AI coding agents write much of the code; tests and kiln check it).
  - **Every sentence must serve this role.** Valid but off-topic evidence is wrong (a nurse
    app's OCR in a localization letter was cut).
  - When the role touches integrations, localization or third-party APIs, name the **full
    breadth**: React SDKs, edge proxy on Cloudflare Workers, CLI (8 file formats), webhooks,
    WordPress plugin, Shopify app, APIs in Python/FastAPI.
  - A count in a sentence must match the list after it ("6 ways: …" lists 6).
  - Say "AI coding agents", never one vendor. No "passionate", "fast-paced" or similar.
- **Form answers:** within the form's limit, grounded with evidenceIds; a link to the
  tailored page is a good use of spare characters (add it after staging, when the slug is known).
- **Notice period / start date:** cv.yaml leaves it out on purpose. If a form asks, leave the
  answer to Janrau and say so in the review; never fill one in.
- **Gaps:** list honestly. They're for Janrau's interview prep, never shown.

## 3. Review before anything leaves the machine

Re-read the draft as the hiring manager. For each cover-note sentence ask: does this answer
something in *their* post? Then run `pnpm job check private/drafts/<company>` and fix every
issue. Show Janrau the summary it prints (fit table, projects, word count, form answers with
character counts, gaps) and the cover note in full.

## 4. Stage, then publish only on approval

- With Janrau's OK: `pnpm job stage private/drafts/<company>`. It prints the review link,
  `https://janrau.dev/admin/review/<slug>`, where Janrau sees the exact page, downloads the
  CV and cover letter, and copies form answers, from any device.
- Publish only when Janrau says so: the Publish button on the review page, or
  `pnpm job publish <slug>`. Staging the same post again keeps its link.
- After publishing, remind Janrau to set the status to "applied" in `/admin` once sent.

## Environment

- Laptop: `.env` holds `CV_PHONE`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`.
  `--local` on stage/publish targets `pnpm dev` instead of janrau.dev.
- Cloud session: the same three as environment variables; network access must allow
  `janrau.dev` and the job sites (see `docs/apply-anywhere.md`). A browser for JavaScript-only
  pages may be unavailable: then ask for pasted text.
