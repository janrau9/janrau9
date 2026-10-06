/**
 * Cloudflare Access puts a signed token (a JWT) on every request it lets through to
 * /admin. Verifying it here means a misconfigured Access app can't expose the
 * dashboard: no valid token, no data. Without configuration, admin fails closed.
 * https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
 */
export interface AccessConfig {
  /** e.g. "janrau.cloudflareaccess.com" */
  teamDomain: string;
  /** The Access application's audience (AUD) tag. */
  aud: string;
}

type Jwk = JsonWebKey & { kid?: string };
export type KeyFetcher = (teamDomain: string) => Promise<Jwk[]>;

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const json = <T>(s: string): T => JSON.parse(new TextDecoder().decode(b64url(s))) as T;

let cachedKeys: { domain: string; keys: Jwk[]; at: number } | undefined;
const KEY_TTL_MS = 10 * 60 * 1000;

export const fetchAccessKeys: KeyFetcher = async (teamDomain) => {
  if (cachedKeys && cachedKeys.domain === teamDomain && Date.now() - cachedKeys.at < KEY_TTL_MS) return cachedKeys.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs: HTTP ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  cachedKeys = { domain: teamDomain, keys, at: Date.now() };
  return keys;
};

/** The verified email (or service token id), or null. Never throws: any doubt means no access. */
export async function verifyAccess(
  token: string | null,
  config: AccessConfig | undefined,
  fetchKeys: KeyFetcher = fetchAccessKeys,
  now = Date.now() / 1000,
): Promise<string | null> {
  if (!token || !config?.teamDomain || !config.aud) return null;
  try {
    const [h, p, sig] = token.split(".");
    if (!h || !p || !sig) return null;
    const header = json<{ alg: string; kid?: string }>(h);
    const payload = json<{
      aud?: string | string[];
      iss?: string;
      exp?: number;
      nbf?: number;
      email?: string;
      /** Service tokens (the CLI) carry their client id here instead of an email. */
      common_name?: string;
    }>(p);
    if (header.alg !== "RS256") return null;
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(config.aud)) return null;
    if (payload.iss !== `https://${config.teamDomain}`) return null;
    if (!payload.exp || payload.exp < now) return null;
    if (payload.nbf && payload.nbf > now + 60) return null;
    const jwk = (await fetchKeys(config.teamDomain)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
      "verify",
    ]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(sig), new TextEncoder().encode(`${h}.${p}`));
    return ok ? (payload.email ?? (payload.common_name ? `service:${payload.common_name}` : "unknown")) : null;
  } catch {
    return null;
  }
}
