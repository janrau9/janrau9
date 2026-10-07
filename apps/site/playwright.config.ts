import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test",
  projects: [
    // The production build, served by the real Worker against local D1 and KV.
    { name: "site", testIgnore: /\.dev\.spec\.ts$/, use: { baseURL: "http://localhost:4322" } },
    // The admin dashboard needs Cloudflare Access in production builds; dev mode opens it locally.
    // Runs after "site": both servers share one local SQLite file for D1, and concurrent writes
    // from two processes fail with SQLITE_BUSY.
    {
      name: "dev",
      testMatch: /\.dev\.spec\.ts$/,
      use: { baseURL: "http://localhost:4323" },
      dependencies: ["site"],
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
