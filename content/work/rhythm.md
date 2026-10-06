---
id: proj.rhythm
title: rhythm
subtitle: A personal goal system with an AI mentor and long-term memory
status: in-use
statusNote: I use it every day. Single user by design while I test its core value.
period: 2026-05 – 2026-07
role: Solo. I designed the product and the memory model and directed the work; Claude wrote much of the code under my review.
stack: [Python, FastAPI, PostgreSQL, pgvector, Telegram bot, Expo, React Native Web, OpenRouter]
repo: private   # code available on request
draft: true     # TODO (Janrau): review
---

## The problem

Big goals (faith, family, health, work) stall because the next step is never obvious on a busy morning. rhythm keeps goals as a tree that breaks down into 15-minute chunks. Every morning it sends a short "quest" of the right chunks for the day, and it logs everything I tell it, so over time it can learn how I actually work.

It is also how I learn long-term memory and context engineering for AI agents, by building one I depend on.

## How it works

1. Goals live in a tree: bucket → goal → task → 15-minute chunk.
2. Everything I send, from the Telegram bot or the web app, goes into an append-only event log. Each event records when it happened and when it was recorded, plus an embedding and topic tags.
3. A small classifier model decides what each message is (a log, a plan request, a question).
4. At 07:00 the bot sends the day's quest. The ranking uses fixed rules (focus, cadence, deadline pressure) rather than an AI call, so it is fast and predictable.
5. Recurring goals keep producing chunks until they are achieved, with an AI check-in on request.

## Decisions

| I chose | Over | Because |
|---|---|---|
| Postgres with pgvector, summary layers and an event log | A graph database | It tracks one person deeply over time, not many connected entities. |
| Rules for ranking the daily quest | An AI call | Fast, cheap and predictable at 07:00, every day. |
| Synchronous AI calls that fail visibly | A job queue | One user doesn't justify the machinery. |
| Rebuilding v1 as v2 | Extending v1 | Daily use of v1 showed it lacked a goal hierarchy, time awareness and a continuous goal loop. |
| A 90-day cohort test before any native app | Building native now | Retention in this category is low, so validating first is cheaper than building. |

## Outcome

- **Real use:** I use it daily. Two surfaces, a Telegram bot and a web app, share one Python codebase.
- **Built:** the goal tree, the planner, logging, the morning quest and recurring goals.
- **Not built yet:** the overnight job that turns the log into summaries and lessons, which is the part that would make it feel like it knows me.

## What it taught me

The AI planner breaks goals into useful chunks, but writing them myself still works better. Planning is part of the thinking, not a chore to automate. I'm still deciding what rhythm's core value is before inviting other users, and that question matters more than the next feature.
