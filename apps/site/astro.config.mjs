import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://janrau.dev",
  // Static by default; /for/* opts into on-demand rendering on the Worker.
  output: "static",
  adapter: cloudflare({
    // Prerendered pages read content/ from disk, which needs Node, not workerd.
    prerenderEnvironment: "node",
    // No images to optimise, so no IMAGES binding.
    imageService: "passthrough",
  }),
  // No sessions, so no SESSION KV namespace.
  session: false,
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
