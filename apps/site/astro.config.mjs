import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://janrau.dev",
  output: "static",
  // /work/slash is served from work/slash.html directly; a folder per page would
  // make Cloudflare redirect /work/slash to /work/slash/ on every click.
  trailingSlash: "never",
  build: {
    format: "file",
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
