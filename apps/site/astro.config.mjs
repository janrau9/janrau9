import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://janrau.dev",
  output: "static",
  build: {
    // External stylesheets only, so the Content-Security-Policy can forbid inline styles.
    inlineStylesheets: "never",
  },
});
