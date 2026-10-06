---
id: proj.sisu-shift
title: Sisu Shift
subtitle: Shift tracking, pay and auto-scheduling for Finnish nurses
status: beta
statusNote: 20 alpha testers on Android; 5 users through Apple's test channel; App Store review in progress. Paused since July 2026 while I focus elsewhere.
period: 2025-10 – 2026-07
role: Solo. I designed the product and the system and directed the work; Claude wrote much of the code under my review.
stack: [React Native, Expo, TypeScript, Supabase, PostgreSQL, Python, FastAPI, OR-Tools CP-SAT, Gemini, EAS]
url: https://sisushift.net
repo: private   # code available on request
featured: true
draft: true     # TODO (Janrau): review. Screenshots come after the content is final.
---

## The problem

Nurses in Finland often get their schedule on paper or in an employer system that is hard to use on a phone. Tracking hours, checking pay and swapping shifts happen in notebooks and spreadsheets. Team leads build rosters by hand while following the Working Hours Act: 11 hours of rest between shifts, weekly hour caps and limits on consecutive days.

My wife is a nurse, and so are most of my friends. I watched them track shifts in notebooks and double-check their pay by hand, so I built the tool I wanted to give them.

Sisu Shift is a phone app with two jobs:
- **For nurses:** photograph a paper schedule to import it, then see hours and pay per shift.
- **For team leads:** collect everyone's preferences and generate a roster that follows the law and spreads the hard shifts fairly.

## Constraints

- **Finnish labour rules are hard constraints.** A roster that breaks the 11-hour rest rule is unusable, however good it looks.
- **Pay must be exact.** Premiums, tax and daylight-saving changes all affect what a nurse is owed.
- **GDPR and EU hosting.** The app stores employment data but no patient data.
- **One developer.** The architecture had to stay small enough for one person to run.

## How auto-scheduling works

1. The lead opens a preferences round for a period, with a deadline.
2. Each member marks every day or slot as `want`, `can` or `cannot`.
3. The lead taps Generate. The app calls a separate Python service (FastAPI).
4. The service reads the team, coverage needs, absences and preferences, and builds a CP-SAT model with OR-Tools.
5. Hard constraints: 11-hour rest, weekly hour caps, consecutive-day limits, coverage and absences. Soft goals: grant `want` days, distribute shifts evenly, share weekends fairly.
6. The service writes the result back in one atomic database call. If solving fails, the round stays open so the lead can adjust and retry.
7. The lead reviews the roster, then publishes, discards or retracts it.

## Decisions

| I chose | Over | Because |
|---|---|---|
| A separate FastAPI + CP-SAT service | Solving inside the main backend | Solving is CPU-heavy. Isolation keeps the app responsive and the cost flat. |
| Labour caps configured per team | Caps hard-coded in the solver | Rules differ between collective agreements, so they come in as data with safe defaults. |
| Cloud vision (Gemini) for photo import | On-device text recognition with user-taught templates | Gemini handles loosely framed photos, so the templates and camera overlay were never needed. I dropped the on-device plan before shipping it. |
| TanStack Query with encrypted on-device storage and replay of queued changes | A custom sync engine with a conflict screen | The server stays the source of truth, and the simpler design covered the offline need. |
| Database migrations before app builds in CI | Building the app first | No user ever gets an app that queries a schema that doesn't exist yet. |
| A pay result that stores a snapshot of the rates used | Recalculating old shifts from current rates | Old pay stays correct after rates change. |

## Outcome

- **Testing with real users:** 20 alpha testers on Android preview builds, and 5 users through Apple's test channel. App Store review is in progress.
- **Auto-scheduler:** built and tested; not yet run on a real team's roster.
- **Size:** 933 commits over 9 months. About 376 app tests, 38 solver tests, 10 database test files and 5 end-to-end flows.
- **Release pipeline:** merging to `main` migrates the database, then builds and submits the iOS and Android apps.
- **Honesty audit:** I checked the project's own docs against the code and corrected them. For example, the early plan cited HIPAA, a US law; the app actually falls under GDPR and Finnish law.

## What I'd do differently

I would position it more broadly. The core of the app is not nursing: it's fitting shift work around a life. The Today screen already tracks rest time, weekly hours and days off against the rules. That serves any shift worker trying to keep a work-life balance, such as a working parent, not only nurses. Starting that broad would have given me a larger pool of strangers to test with, instead of mostly friends.
