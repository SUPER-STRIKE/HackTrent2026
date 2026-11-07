"use server";

import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { decideEvent, isUuid } from "@/lib/events";
import { hasFreshStepUp, markStepUpUsed, stepUpLoginUrl } from "@/lib/step-up";
import { approverName, isApprover } from "@/lib/approvers";

async function requireApprover() {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/approvals");
  if (!isApprover(session.user)) redirect("/approvals?notice=not-approver");
  return session;
}

/** Approving a risky action needs a fresh MFA login, spent on this one approval. */
export async function approveAction(formData: FormData) {
  const id = formData.get("id");
  if (!isUuid(id)) redirect("/approvals?notice=invalid");
  const session = await requireApprover();

  if (!hasFreshStepUp(session)) redirect(stepUpLoginUrl(`/approvals?confirm=${id}`));

  // Spend the MFA before writing, so a replayed form cannot reuse it.
  await auth0.updateSession(markStepUpUsed(session));
  const ok = await decideEvent(id, "approved", approverName(session.user));
  redirect(ok ? "/approvals?notice=approved" : "/approvals?notice=already-decided");
}

/** Denying is the safe direction, so a normal login is enough. */
export async function denyAction(formData: FormData) {
  const id = formData.get("id");
  if (!isUuid(id)) redirect("/approvals?notice=invalid");
  const session = await requireApprover();

  const ok = await decideEvent(id, "denied", approverName(session.user));
  redirect(ok ? "/approvals?notice=denied" : "/approvals?notice=already-decided");
}
