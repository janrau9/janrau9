// The Worker bindings this site uses (see wrangler.jsonc), typed narrowly.
// Full runtime types (`wrangler types`) redefine DOM globals and break the browser
// scripts' types, so only the surface actually used is declared here.
declare module "cloudflare:workers" {
  export const env: {
    DB?: import("./lib/tailored").Db;
    CV_FILES: { get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null> };
  };
}
