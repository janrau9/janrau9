---
id: proj.slash
title: Slash
subtitle: Live darts tournaments on three phones per match
status: live
statusNote: Used for 4 real pub tournaments so far. League ratings built, not yet in real use.
period: 2026-07 – 2026-09
role: Solo. I designed the system and directed the work; AI coding agents wrote much of the code under my review.
stack: [React 19, TypeScript, Vite, PWA, Hono, Bun, PostgreSQL, Drizzle, Zero, Cloudflare Workers, Coolify]
url: https://slash.nurho.net
repo: private   # code available on request
featured: true
draft: false
---

## The problem

I play darts, and so do most of my friends and colleagues. A pub tournament night runs on paper: someone draws the bracket, chalk scores get read out, and nobody outside the board knows what is happening.

Slash runs the whole evening from phones. An organizer creates the tournament. Players join with a PIN or QR code, without an account. A double-elimination bracket runs across the pub's boards. In each match, three phones (two players and a scorer) show the same score live, and spectators follow the bracket and stats from their own phones.

## Constraints

- **One evening, no setup.** Players must join in seconds, with no account or install.
- **Several phones write to one match.** Any of the three phones may enter a score, so the keypad is never passed around.
- **One small server.** The API, sync service and database run on a single VPS.
- **A pub is one IP address.** Sixteen players on venue wifi share an address, so per-IP limits would block a whole tournament.

## How it works

1. A player enters a score. Their phone creates the visit with its own ID (a UUIDv7).
2. The phone sends the visit to the API (Hono on Bun). The ID doubles as an idempotency key, so a retried request never counts twice.
3. The API appends the visit to `visits`, an append-only log. Scores, legs and statistics are all derived from that log; undo is a soft delete.
4. Zero, a sync engine, streams the new state to every subscribed phone over WebSocket. Reads go through Zero; every write goes through the API.
5. When a league tournament ends, a hook updates Glicko-2 player ratings. Corrections never patch ratings; they replay the whole league from the log.

## Decisions

| I chose | Over | Because |
|---|---|---|
| One sync engine, Zero | Two engines, as in my earlier app ShotClock | One evening needs live state, not offline writes. The visit log and client-generated IDs keep offline possible later. |
| The Postgres publication as the secrecy boundary | Hiding columns in the client schema | The sync service ships whole rows. A column hidden only in the schema still reaches every phone. (This is the incident below.) |
| Rate limits per session, per IP only where sessions are created | Per-IP limits everywhere | A whole pub shares one IP address. |
| A CAPTCHA (Turnstile) on event registration only | On three endpoints, including sign-in | A failed challenge on sign-in locks a player out. Registration is the one write a rate limit can't protect: in an abuse test, one script filled all 8 seats of a night. |
| Ratings rebuilt by deterministic replay | Editing stored ratings | One correction path, so ratings can never drift from the results. |

## Incident: tournament PINs reached every phone

A test I added for the sync layer showed that tournament PINs and rejoin codes were reaching anonymous clients. The cause was the decision above: the columns were hidden in the client schema, but the sync service sends whole rows from the Postgres publication. Production was exposed until the fix.

I fixed it at the source by removing the secret columns from the publication. The test, `publication.test.ts`, now runs in CI and fails if a secret column is ever published again.

## Outcome

- **Real use:** 4 pub tournaments so far. Live sync across three phones per match held up from the first one.
- **Delivery:** about 9 weeks from first commit to production: 405 commits.
- **Testing:** about 760 automated tests across the API (against a real Postgres), web app and shared packages, all in CI.
- **Built but not yet used:** leagues with Glicko-2 ratings, written by hand from Glickman's paper.

## What changed after the first tournament

After the first tournament I listed what needed to change, then built it before the next three tournaments.
