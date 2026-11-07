import type { SessionData } from "@auth0/nextjs-auth0/types";
import { db } from "@/lib/db";

/** How long after an MFA login an approval is still accepted. */
export const STEP_UP_MAX_AGE_SECONDS = 5 * 60;

const MFA_ACR = "http://schemas.openid.net/pape/policies/2007/06/multi-factor";

type StepUpClaims = { amr?: unknown; auth_time?: unknown };

function mfaAuthTime(session: SessionData, now: number): number | null {
  const { amr, auth_time } = session.user as StepUpClaims;
  if (!Array.isArray(amr) || !amr.includes("mfa")) return null;
  if (typeof auth_time !== "number" || now - auth_time > STEP_UP_MAX_AGE_SECONDS) return null;
  return auth_time;
}

export type StepUpState = {
  ok: boolean;
  /** ok, or why an approval cannot use this login. */
  reason: "ok" | "no-mfa" | "stale" | "spent";
  amr: string[];
  /** Seconds since this login, when the token says. */
  ageSeconds: number | null;
};

/** Explains whether this login can approve an action, so the UI can say why when it cannot. */
export async function stepUpState(session: SessionData, now = Date.now() / 1000): Promise<StepUpState> {
  const { amr, auth_time } = session.user as StepUpClaims;
  const amrList = Array.isArray(amr) ? amr.filter((a): a is string => typeof a === "string") : [];
  const ageSeconds = typeof auth_time === "number" ? Math.round(now - auth_time) : null;
  if (!amrList.includes("mfa")) return { ok: false, reason: "no-mfa", amr: amrList, ageSeconds };
  if (ageSeconds === null || ageSeconds > STEP_UP_MAX_AGE_SECONDS) return { ok: false, reason: "stale", amr: amrList, ageSeconds };
  const fresh = await hasFreshStepUp(session, now);
  return { ok: fresh, reason: fresh ? "ok" : "spent", amr: amrList, ageSeconds };
}

/** True when the session comes from a login that finished MFA within the last STEP_UP_MAX_AGE_SECONDS and has not been spent. */
export async function hasFreshStepUp(session: SessionData, now = Date.now() / 1000): Promise<boolean> {
  const authTime = mfaAuthTime(session, now);
  if (authTime === null) return false;
  const { rowCount } = await db.query("SELECT 1 FROM spent_step_ups WHERE user_sub = $1 AND auth_time = $2", [session.user.sub, authTime]);
  return rowCount === 0;
}

/**
 * Atomically spends this MFA login. Returns false if it is not fresh or was already spent,
 * so concurrent or replayed requests (even with an old cookie) cannot reuse it.
 */
export async function spendStepUp(session: SessionData, now = Date.now() / 1000): Promise<boolean> {
  const authTime = mfaAuthTime(session, now);
  if (authTime === null) return false;
  const { rowCount } = await db.query(
    "INSERT INTO spent_step_ups (user_sub, auth_time) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [session.user.sub, authTime],
  );
  return rowCount === 1;
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
