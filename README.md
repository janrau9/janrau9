<!-- Generated from content/cv.yaml by packages/cv-render. Do not edit by hand: run `pnpm render`. -->

# Janrau Beray

**Software Engineer — TypeScript, React and Python, shipping with AI agents** · Vantaa, Finland

Software engineer in Finland. I started in electronics: an engineering degree, then equipment engineering at Texas Instruments. I ran my own recording studio, moved to Finland in 2022 and trained at Hive Helsinki. Since August 2025 I have been the integrations developer at a localization SaaS startup.

I design the systems and direct the work; Claude writes much of the code under my review. Every change runs through a loop I built: type checks and tests on each edit, kiln (my code-intelligence tool) for exact references and type errors, and my review before it ships.

**[janrau.dev](https://janrau.dev)** · [CV (PDF)](https://janrau.dev/janrau-beray-cv.pdf) · [LinkedIn](https://www.linkedin.com/in/janrau-beray) · janraup356@gmail.com

## Now

Integrations Developer, Localization SaaS startup.

- Sole integrations developer; built 6 integration types end to end, from JavaScript/React SDKs and an edge proxy to a CLI, webhooks, a WordPress plugin and a Shopify app.
- Built a multi-tenant translation proxy on Cloudflare Workers that serves many customer sites from one deployment.
- Built a CLI that syncs 8 translation file formats for iOS, Android and web projects.

## Selected work

- **Slash**: Darts tournament app for pub nights. Players join by PIN or QR code, and every match syncs live across three phones.
- **kiln**: Command-line tool that gives AI coding agents IDE-grade references, definitions, type errors and one-shot runtime debugging.
- **Sisu Shift**: Mobile app for Finnish nurses that tracks shifts and calculates pay; team leads can generate schedules from members' preferences.

<details><summary>More projects</summary>

- **synchd**: Local-first chord charts on a beat grid; a live session keeps every band member's screen on the same bar.
- **ShotClock**: Basketball league app for grassroots leagues in the Philippines, with offline courtside scoring and live standings.
- **rhythm**: Personal goal system with a mentor voice, as a Telegram bot and an installable web app.
- **Claude skills and Seiza**: Public repo of Claude Code skills, including Seiza, my design system, used in production by Slash and synchd.

</details>

## About this repository

This repository is the source of [janrau.dev](https://janrau.dev). One file, `content/cv.yaml`, generates the website, the PDF CV and this README, and CI rejects any change that breaks the schema. Decisions are recorded in [`content/adr/`](content/adr/).

<sub>Set in seiza · a design language by [janrau](https://github.com/janrau9/claude-skills)</sub>
