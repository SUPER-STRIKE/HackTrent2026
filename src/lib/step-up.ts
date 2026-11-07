import type { SessionData } from "@auth0/nextjs-auth0/types";

/** How long after an MFA login an approval is still accepted. */
export const STEP_UP_MAX_AGE_SECONDS = 5 * 60;

const MFA_ACR = "http://schemas.openid.net/pape/policies/2007/06/multi-factor";

/**
 * True when the session comes from a login that finished MFA within the last
 * STEP_UP_MAX_AGE_SECONDS and has not yet been spent on an approval.
 * Each approval spends it (see markStepUpUsed), so every approval needs its own MFA.
 */
export function hasFreshStepUp(session: SessionData, now = Date.now() / 1000): boolean {
  const { amr, auth_time, mfa_used_at } = session.user as {
    amr?: unknown;
    auth_time?: unknown;
    mfa_used_at?: unknown;
  };
  if (!Array.isArray(amr) || !amr.includes("mfa")) return false;
  if (typeof auth_time !== "number" || now - auth_time > STEP_UP_MAX_AGE_SECONDS) return false;
  if (typeof mfa_used_at === "number" && mfa_used_at >= auth_time) return false;
  return true;
}

/** Marks the current MFA login as spent. Returns the updated session to save. */
export function markStepUpUsed(session: SessionData): SessionData {
  const authTime = (session.user as { auth_time?: number }).auth_time;
  return { ...session, user: { ...session.user, mfa_used_at: authTime } };
}

/**
 * Login URL that forces a fresh login with MFA, then returns to `returnTo`.
 * max_age=0 makes Auth0 re-authenticate so `auth_time` is fresh, and acr_values
 * asks for MFA (enforced by the Auth0 Action in auth0/actions/step-up-mfa.js).
 */
export function stepUpLoginUrl(returnTo: string): string {
  const params = new URLSearchParams({ acr_values: MFA_ACR, max_age: "0", returnTo });
  return `/auth/login?${params}`;
}
