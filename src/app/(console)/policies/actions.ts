"use server";

import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { approverName, isApprover } from "@/lib/approvers";
import { isUuid } from "@/lib/events";
import { agentExists, createPolicy, deletePolicy, getPolicy, setPolicyEnabled } from "@/lib/policy";
import { spendStepUp, stepUpLoginUrl } from "@/lib/step-up";
import { validatePolicy, type PolicyEffect, type PolicyMatchOn } from "@/lib/scoring-core";

const EFFECTS: PolicyEffect[] = ["deny", "require_approval", "allow"];
const MATCHES: PolicyMatchOn[] = ["any", "action_type", "target", "payload"];

async function requireApprover() {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/policies");
  if (!isApprover(session.user)) redirect("/policies?notice=not-approver");
  return session;
}

const text = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);

/** Rules that let more through (allow) need a fresh MFA, like an approval does. Tightening only needs a login. */
export async function createPolicyAction(formData: FormData) {
  const session = await requireApprover();
  const effect = text(formData, "effect", 32) as PolicyEffect;
  const match_on = text(formData, "match_on", 32) as PolicyMatchOn;
  const name = text(formData, "name", 80);
  const pattern = text(formData, "pattern", 300);
  if (!EFFECTS.includes(effect) || !MATCHES.includes(match_on) || !name) redirect("/policies?notice=invalid");
  if (validatePolicy(effect, match_on, pattern)) redirect("/policies?notice=bad-pattern");

  // A scope that names no known agent would silently never match, so refuse it.
  const agentId = text(formData, "agent_id", 128);
  if (agentId && !(await agentExists(agentId))) redirect("/policies?notice=unknown-agent");

  if (effect === "allow" && !(await spendStepUp(session))) redirect(stepUpLoginUrl("/policies?notice=mfa-needed"));

  await createPolicy({
    name,
    pattern,
    match_on,
    agent_id: agentId || null,
    effect,
    reason: text(formData, "reason", 300) || null,
    created_by: approverName(session.user),
  });
  redirect("/policies?notice=created");
}

export async function togglePolicyAction(formData: FormData) {
  const session = await requireApprover();
  const id = formData.get("id");
  if (!isUuid(id)) redirect("/policies?notice=invalid");
  const enable = formData.get("enable") === "1";
  const rule = await getPolicy(id);
  if (!rule) redirect("/policies?notice=invalid");
  // Switching off a deny or require rule, or switching on an allow rule, loosens protection, so it needs MFA.
  const loosens = enable === (rule.effect === "allow");
  if (loosens && !(await spendStepUp(session))) redirect(stepUpLoginUrl("/policies?notice=mfa-needed"));
  await setPolicyEnabled(id, enable);
  redirect("/policies");
}

export async function deletePolicyAction(formData: FormData) {
  const session = await requireApprover();
  const id = formData.get("id");
  if (!isUuid(id)) redirect("/policies?notice=invalid");
  const rule = await getPolicy(id);
  if (!rule) redirect("/policies?notice=invalid");
  if (rule.effect !== "allow" && !(await spendStepUp(session))) redirect(stepUpLoginUrl("/policies?notice=mfa-needed"));
  await deletePolicy(id);
  redirect("/policies?notice=deleted");
}
