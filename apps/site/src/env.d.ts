// The Worker bindings this site uses (see wrangler.jsonc), typed narrowly.
// Full runtime types (`wrangler types`) redefine DOM globals and break the browser
// scripts' types, so only the surface actually used is declared here.
declare module "cloudflare:workers" {
  export const env: {
    DB?: import("./lib/tailored").Db;
    CV_FILES: {
      get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
      get(key: string, type: "text"): Promise<string | null>;
      put(key: string, value: string | ArrayBuffer | Uint8Array): Promise<void>;
    };
    /** Cloudflare Access team domain, e.g. "janrau.cloudflareaccess.com". Admin is closed without it. */
    ACCESS_TEAM_DOMAIN?: string;
    /** The Access application's AUD tag. Admin is closed without it. */
    ACCESS_AUD?: string;
  };
}

declare namespace App {
  interface Locals {
    cfContext?: { waitUntil(promise: Promise<unknown>): void };
  }
}
