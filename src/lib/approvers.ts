import type { User } from "@auth0/nextjs-auth0/types";

/**
 * Only users listed in APPROVER_EMAILS (comma-separated) may approve or deny.
 * Fails closed: with the variable unset, nobody can. Without this, anyone able
 * to sign up in the Auth0 tenant could approve agent actions.
 */
export function isApprover(user: User): boolean {
  const allowed = (process.env.APPROVER_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const email = typeof user.email === "string" ? user.email.toLowerCase() : "";
  return !!email && user.email_verified === true && allowed.includes(email);
}

export function approverName(user: User): string {
  return (typeof user.email === "string" && user.email) || user.sub;
}

export const NOT_APPROVER_TEXT =
  "Your account is not on the approver list (APPROVER_EMAILS), or its email is not verified, so you cannot view this.";
