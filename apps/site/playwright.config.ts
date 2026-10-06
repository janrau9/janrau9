import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test",
  use: { baseURL: "http://localhost:4322" },
  webServer: { command: "pnpm exec astro preview --port 4322 --ignore-lock", port: 4322, reuseExistingServer: false },
});
