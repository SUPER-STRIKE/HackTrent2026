import { createRemoteJWKSet, jwtVerify } from "jose";

export type AgentIdentity = { agentId: string; clientId: string };

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

/**
 * Verifies an Auth0 machine-to-machine access token (client-credentials grant)
 * sent as `Authorization: Bearer <jwt>`. Returns null when missing or invalid.
 * Requires AUTH0_DOMAIN and AUTH0_AUDIENCE (the identifier of the Tripwire API in Auth0).
 */
export async function authenticateAgent(request: Request): Promise<AgentIdentity | null> {
  const domain = process.env.AUTH0_DOMAIN;
  const audience = process.env.AUTH0_AUDIENCE;
  // Fail closed: the audience may be shared (Auth0 Management API), so an allow-list is mandatory.
  const allowed = (process.env.AUTH0_AGENT_CLIENT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!domain || !audience || !allowed.length)
    throw new Error("AUTH0_DOMAIN, AUTH0_AUDIENCE and AUTH0_AGENT_CLIENT_IDS must be set");

  const header = request.headers.get("authorization") ?? "";
  const token = header.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return null;

  const issuer = `https://${domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}/`;
  jwks ??= createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`));

  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience, algorithms: ["RS256"] });
    // M2M tokens carry the client id in `azp` and use `<client_id>@clients` as `sub`.
    const clientId = (payload.azp as string | undefined) ?? payload.sub;
    if (!clientId) return null;
    // Optional allow-list, useful when the audience is shared (e.g. the Auth0 Management API).
    if (!allowed.includes(clientId)) return null;
    return { agentId: clientId, clientId };
  } catch {
    return null;
  }
}
