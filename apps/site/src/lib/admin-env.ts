import { env } from "cloudflare:workers";
import type { AccessConfig } from "./access";

/** Access settings from the Worker's vars; undefined keeps admin closed. */
export function accessConfig(): AccessConfig | undefined {
  return env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD
    ? { teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD }
    : undefined;
}
