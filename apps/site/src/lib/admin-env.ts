import { env } from "cloudflare:workers";
import type { AccessConfig, verifyAccess } from "./access";

/** Access settings from the Worker's vars; undefined keeps admin closed. */
export function accessConfig(): AccessConfig | undefined {
  return env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD
    ? { teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD }
    : undefined;
}

/**
 * The signed-in admin's email, or null. In `astro dev` only, admin opens without Access
 * so the dashboard can be built and checked locally; production builds compile this
 * branch away (import.meta.env.DEV is false), so it can never ship.
 */
export async function adminEmail(request: Request, verify: typeof verifyAccess): Promise<string | null> {
  if (import.meta.env.DEV) return "dev@localhost";
  return verify(request.headers.get("cf-access-jwt-assertion"), accessConfig());
}
