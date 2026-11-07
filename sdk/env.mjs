import { Tripwire } from "./tripwire.mjs";

/**
 * Builds a client from environment variables, so command-line adapters need no code:
 *   TRIPWIRE_URL, TRIPWIRE_AUTH0_DOMAIN, TRIPWIRE_AUDIENCE, TRIPWIRE_CLIENT_ID, TRIPWIRE_CLIENT_SECRET,
 *   TRIPWIRE_AGENT_NAME (optional), TRIPWIRE_FAIL_MODE = closed | allowlist | open (default closed),
 *   TRIPWIRE_OFFLINE_ALLOW = comma-separated action types allowed while Tripwire is unreachable,
 *   TRIPWIRE_TOKEN_URL (optional override).
 */
export function tripwireFromEnv(env = process.env, overrides = {}) {
  return new Tripwire({
    baseUrl: env.TRIPWIRE_URL,
    auth0Domain: env.TRIPWIRE_AUTH0_DOMAIN,
    tokenUrl: env.TRIPWIRE_TOKEN_URL || undefined,
    audience: env.TRIPWIRE_AUDIENCE,
    clientId: env.TRIPWIRE_CLIENT_ID,
    clientSecret: env.TRIPWIRE_CLIENT_SECRET,
    agentName: env.TRIPWIRE_AGENT_NAME,
    failMode: env.TRIPWIRE_FAIL_MODE || "closed",
    offlineAllow: (env.TRIPWIRE_OFFLINE_ALLOW ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    ...overrides,
  });
}
