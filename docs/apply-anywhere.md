# Applying from anywhere

The `apply` skill (`.claude/skills/apply/`) runs the same on the laptop and in a cloud
Claude Code session opened on this repo from the Claude app. Application state lives on
janrau.dev (D1 and KV), so a session can start on one surface and finish on another; the
local `private/drafts/` folder is scratch space only.

## One-time setup

### 1. A service token for the CLI

`pnpm job stage` and `pnpm job publish` call `janrau.dev/admin/api/*`, which Cloudflare
Access protects. A service token lets the CLI through without a browser login, and can do
nothing except reach `/admin`.

1. Zero Trust → **Access → Service credentials → Service tokens → Create service token**.
   Name it `apply-cli`. Copy the **Client ID** and **Client Secret** (the secret is shown once).
2. **Access → Applications → Portfolio admin → Policies → Add a policy**:
   action **Service Auth**, include **Service Token** → `apply-cli`.
3. On the laptop, add to `.env` (gitignored):
   ```
   CF_ACCESS_CLIENT_ID=…
   CF_ACCESS_CLIENT_SECRET=…
   ```

### 2. A cloud environment (Claude app → Claude Code → environment settings)

- **Environment variables:** `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `CV_PHONE`.
  These are visible to anyone who can use the environment; keep it private.
- **Network access:** the default allowlist doesn't include job sites or janrau.dev. Use
  **Custom** and allow at least `janrau.dev`, `boards-api.greenhouse.io`, `api.ashbyhq.com`,
  `*.myworkdayjobs.com`, `*.notion.site`, or **Full** if posts come from many company sites.
  When a site isn't reachable, paste the post's text instead.

## Surfaces

| Surface | Works | Notes |
|---|---|---|
| Claude Code on the laptop | Yes | Full ladder, including a real browser for JavaScript-only pages. `--local` targets `pnpm dev`. |
| Claude Code in the Claude app (cloud session on this repo) | Yes, after setup above | Loads the repo's skill and `/apply`. Working files vanish after the session; the staged application doesn't. |
| Claude Cowork | Not for the CLI | No shell access, as far as Cowork's documentation shows. Review, download and publish from `janrau.dev/admin` in any browser instead. |

## Review and attachments, from any device

`https://janrau.dev/admin/review/<slug>` shows the page exactly as a recruiter will, the
private gaps, the form answers with copy buttons, and the CV and cover letter as downloads.
Publishing is a button there.
