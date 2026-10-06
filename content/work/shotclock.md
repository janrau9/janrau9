---
id: proj.shotclock
title: ShotClock
subtitle: Grassroots basketball leagues with offline courtside scoring
status: building
statusNote: MVP. Onboarding the first league. Paused since August 2026 while I focus elsewhere.
period: 2026-04 – 2026-08
role: Solo. I designed the product and the system and directed the work; Claude wrote much of the code under my review.
stack: [React 19, TypeScript, PWA, Hono, Bun, PostgreSQL, Drizzle, PowerSync, Zero, WebRTC, Coolify]
url: https://shotclock.nurho.net
repo: private   # code available on request
draft: true     # TODO (Janrau): review
---

## The problem

Neighbourhood basketball leagues in the Philippines run on group chats, spreadsheets and Facebook posts. Nobody has live scores, standings are updated by hand, and player stats don't exist.

ShotClock gives a league the basics of a professional one: courtside scoring, live scores for fans, standings and player stats.

## Constraints

- **Courts have weak or no signal.** Scoring must work fully offline.
- **Most users are on Android phones,** many of them low-end.
- **Recording a play must take under a second,** or the scorer falls behind the game.

## How a scored basket reaches a fan

1. The scorekeeper taps "2 points". The phone writes the event to a local SQLite database through PowerSync, with an ID it generates itself (a UUIDv7). This works with no signal.
2. When the phone reconnects, its upload queue posts the events to the API (Hono on Bun).
3. The API validates each event and inserts it into `game_events`, the append-only log that scores, stats and standings are derived from. The event ID is an idempotency key, so a retried upload never counts a basket twice.
4. Postgres replicates the change to the Zero sync service.
5. Every fan's screen updates live over WebSocket.

Events that arrive after a game is marked complete are still accepted, and the stats are recalculated.

## Decisions

| I chose | Over | Because |
|---|---|---|
| Two sync engines: PowerSync for the scorekeeper, Zero for everyone else | One engine for everything | Offline writes are non-negotiable for scoring. Every other screen only needs live reads. It was worth the complexity. |
| Zero data kept in memory only | Persisting it on the device | Fans lose signal for seconds, not hours. Persistence would add cache problems for little gain. |
| Auth inside my own API (Better Auth) | A hosted auth service | Users stay in my own tables, with no vendor lock-in. |
| Video by pasted link in the MVP | Facebook and YouTube video pickers | The required permission alarms users, and the platform review could block launch. |
| A fixed-cost relay for live broadcasts | A managed video service | Managed video bills per viewer-minute: about $20–35 for one 200-viewer game. Facebook and YouTube carry the viewers for free. |

## Outcome

- **Status:** MVP, onboarding the first league.
- **Operations:** error tracking tied to releases, a release per commit, Postgres backups and a deploy-day runbook.
- **Live streaming:** I proved browser-to-relay video (WebRTC) for a broadcast with a live scoreboard overlay. The picture quality isn't good enough yet, so it isn't released.

## What it taught me

ShotClock was the first build of the architecture I reused in Slash: an append-only event log, client-generated IDs and Zero for live views. Slash kept the pattern and dropped the second sync engine, because a pub night doesn't need offline writes.
