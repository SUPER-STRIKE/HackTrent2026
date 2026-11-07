import { Auth0Client, filterDefaultIdTokenClaims } from "@auth0/nextjs-auth0/server";
import { decodeJwt } from "jose";

export const auth0 = new Auth0Client({
  // Keep the claims step-up MFA needs (`amr`, `auth_time`) next to the default profile claims.
  // The SDK has already verified the ID token by the time this runs.
  async beforeSessionSaved(session, idToken) {
    const claims = idToken ? decodeJwt(idToken) : {};
    return {
      ...session,
      user: {
        ...filterDefaultIdTokenClaims(session.user),
        amr: Array.isArray(claims.amr) ? claims.amr : [],
        auth_time: typeof claims.auth_time === "number" ? claims.auth_time : undefined,
      },
    };
  },
});
