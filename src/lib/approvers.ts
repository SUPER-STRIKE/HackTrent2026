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

/**
 * Viewer mode (VIEWER_MODE=1): any signed-in user may READ the console (dashboard, incidents, Investigator,
 * pending approvals, policies) so reviewers can try the demo. Approving, denying and editing policies stay
 * approver-only. Off by default: with the variable unset, only approvers can see anything.
 */
export const viewerModeOn = () => process.env.VIEWER_MODE === "1";

/** May this user read the console? */
export function canView(user: User): boolean {
  return isApprover(user) || viewerModeOn();
}

export const VIEWER_TEXT =
  "You are signed in as a read-only viewer. You can look around and ask the Investigator, but only approvers can approve, deny or change policies.";

export function approverName(user: User): string {
  return (typeof user.email === "string" && user.email) || user.sub;
}

export const NOT_APPROVER_TEXT =
  "Your account is not on the approver list (APPROVER_EMAILS), or its email is not verified, so you cannot view this.";
