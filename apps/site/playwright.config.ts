import { defineConfig } from "@playwright/test";

// Three stages, in order, because the local D1 is one SQLite file shared by every process that
// touches it: the preview server, the dev server, and the Wrangler CLI the event tests use to
// read and clear events. Two processes writing at once fail with SQLITE_BUSY; a failed read
// sends a tailored page to its fallback (the home page), which looks like a broken link.
export default defineConfig({
  testDir: "test",
  projects: [
    // The production build, served by the real Worker against local D1 and KV.
    {
      name: "site",
      testIgnore: [/\.dev\.spec\.ts$/, /events\.spec\.ts$/],
      use: { baseURL: "http://localhost:4322" },
    },
    // Event recording: these tests write D1 through the Wrangler CLI, so nothing else runs alongside.
    {
      name: "events",
      testMatch: /events\.spec\.ts$/,
      use: { baseURL: "http://localhost:4322" },
      dependencies: ["site"],
    },
    // The admin dashboard needs Cloudflare Access in production builds; dev mode opens it locally.
    {
      name: "dev",
      testMatch: /\.dev\.spec\.ts$/,
      use: { baseURL: "http://localhost:4323" },
      dependencies: ["events"],
    },
  ],
  webServer: [
    {
      command: "node scripts/seed-local.mjs && pnpm exec astro preview --port 4322 --ignore-lock",
      port: 4322,
      reuseExistingServer: false,
    },
    { command: "pnpm exec astro dev --port 4323 --ignore-lock", port: 4323, reuseExistingServer: false },
  ],
});
