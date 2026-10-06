import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://janrau.dev",
  output: "static",
  build: {
    // External stylesheets only, so the Content-Security-Policy can forbid inline styles.
    inlineStylesheets: "never",
  },
  vite: {
    build: {
      // Never inline scripts or fonts as data: URLs; the CSP allows only same-origin files.
      assetsInlineLimit: 0,
    },
  },
});
