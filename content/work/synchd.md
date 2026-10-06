---
id: proj.synchd
title: synchd
subtitle: Local-first chord charts that keep a whole band on the same bar
status: live
statusNote: Used in a live performance by my 4-piece band. Live and invite only.
period: 2026-07 – present
role: Solo. I designed the system and directed the work; AI coding agents wrote much of the code under my review.
stack: [React 19, TypeScript, Vite, PWA, Hono, Bun, PostgreSQL, PowerSync, WebSockets, Playwright, Cloudflare Workers]
url: https://synchd.nurho.net
repo: private   # code available on request
draft: false
---

## The problem

I play in a band. On stage we read from printed sheets or our own handwritten cheat sheets. Paper doesn't follow the song: when the leader jumps to the bridge or repeats a chorus, everyone looks for their place, and a band on unreliable venue Wi-Fi can't depend on the cloud.

synchd shows chord charts on a beat grid. In a live session, one person drives the song position and every member's screen follows it on the same bar.

## Constraints

- **Followers stay within 300 ms of the leader** (95th percentile), or the cursor is useless.
- **It must keep working when the venue Wi-Fi fails.**
- **Joining a band is a link,** not an app-store install.

## How a live session works

1. Each member's phone already holds the band's whole library in a local SQLite database, synced by PowerSync. Songs open instantly and offline.
2. The leader starts a song. A small transport event (song, bar, tempo, start time) goes out over a WebSocket room, separate from the data sync.
3. Each phone converts the start time to its own clock. The clock has three layers: `performance.now()`, which never jumps; a server offset measured NTP-style as the median of several pings; and the wall clock as a fallback until the offset is known.
4. Each phone computes the song position locally from that clock, so network jitter never makes the cursor stutter.
5. A plain TypeScript engine moves the cursor on every 16th note by updating the page directly. React renders only the structure (sections and bars), never per-tick updates.

## Decisions

| I chose | Over | Because |
|---|---|---|
| Two planes: PowerSync for data, WebSocket rooms for transport | Sending transport through the database | Songs can arrive in seconds; the beat cursor needs milliseconds. Different problems, different paths. |
| PowerSync only | PowerSync plus Zero, as in my earlier app ShotClock | A band is one small group that holds the full library. Zero's live fan-out to many readers would have no audience. |
| A framework-free engine for the beat clock | Rendering ticks through React | The hot path stays fast and predictable on cheap phones. |
| A PWA joined by link | A native app | A new member joins by opening a link. |
| A 45,916-chart catalogue as the first import path | AI import first | The catalogue is free and gives the same result every time. The paid AI import is the fallback. |
| Song edits as proposals the owner accepts | Anyone editing directly | Like a pull request: each accepted change is an attributed revision. |

## Security fix: authorizing from the stored row

A security review on 2026-08-03 found a cross-tenant write bug. The API checked permissions against the copy of the row the client sent, then wrote `WHERE id = ?`. A crafted request could take over another band's data. I fixed it the same day: the API now reads the stored row and authorizes against that, never against the request payload. The same review made band join codes revocable and limited in how often they can be used.

## Outcome

- **Real use:** a live performance with my 4-piece band, replacing printed sheets.
- **Testing:** about 2,255 unit tests and 132 Playwright end-to-end tests, run in CI against a real Postgres.
- **Catalogue:** 45,916 charts imported; 97.5% of source rows parse to a chart with both chords and lyrics.
- **Pace:** 906 commits in about 9 weeks.

## What's next

The goals from my own spec are still open: two real bands using it at once, and a full gig with no lost positions. I'm happy with the editor as it is, so the next work is more real sessions, not more features.
