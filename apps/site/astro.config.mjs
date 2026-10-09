import { readFile } from "node:fs/promises";
import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from "astro/config";

/**
 * Dev only: ONNX Runtime imports its loader (public/elevator/runtime/*.mjs) at runtime from
 * the worker. Vite's dev server refuses a /public file imported from source, so serve those
 * files as they are, before Vite sees them. A build copies them as-is and needs nothing.
 */
const elevatorRuntimeInDev = {
  name: "elevator-runtime-in-dev",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const path = req.url?.split("?")[0] ?? "";
      if (!/^\/elevator\/runtime\/[\w.-]+\.mjs$/.test(path)) return next();
      try {
        const file = await readFile(new URL(`./public${path}`, import.meta.url));
        res.setHeader("Content-Type", "text/javascript");
        res.end(file);
      } catch {
        next();
      }
    });
  },
};

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
    plugins: [elevatorRuntimeInDev],
    resolve: {
      // Elevator mode needs only the plain WebAssembly build of ONNX Runtime (11 MB), not the
      // default WebGPU build (22 MB).
      alias: { "onnxruntime-web": "onnxruntime-web/wasm" },
    },
    worker: { format: "es" },
    build: {
      // Never inline scripts or fonts as data: URLs; the CSP allows only same-origin files.
      assetsInlineLimit: 0,
    },
  },
});
