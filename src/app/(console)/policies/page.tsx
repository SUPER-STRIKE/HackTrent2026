import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { isApprover, NOT_APPROVER_TEXT } from "@/lib/approvers";
import { listPolicies } from "@/lib/policy";
import { NotApprover, PageHead } from "@/components/ui";
import { createPolicyAction, deletePolicyAction, togglePolicyAction } from "./actions";

export const instant = false;

const NOTICES: Record<string, { text: string; tone: "ok" | "warn" }> = {
  created: { text: "Policy created. It applies to the next action an agent reports.", tone: "ok" },
  deleted: { text: "Policy deleted.", tone: "ok" },
  invalid: { text: "Check the form: name, effect and match are required.", tone: "warn" },
  "bad-pattern": { text: "The pattern is empty, too long, or not a valid regular expression.", tone: "warn" },
  "mfa-needed": { text: "MFA verified. Submit the change again to apply it.", tone: "warn" },
  "not-approver": { text: NOT_APPROVER_TEXT, tone: "warn" },
};

const EFFECT_TEXT = {
  deny: "Block at once",
  require_approval: "Always ask a human",
  allow: "Let through when not critical",
} as const;

export default function PoliciesPage({ searchParams }: PageProps<"/policies">) {
  return (
    <>
      <PageHead
        title="Policies"
        sub="Your own rules. They run before the risk model: block, always ask, or allow. Loosening a rule needs a fresh MFA check."
      />
      <Suspense fallback={<p className="loading">Loading…</p>}>
        <Rules searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Rules({ searchParams }: { searchParams: PageProps<"/policies">["searchParams"] }) {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/policies");
  if (!isApprover(session.user)) return <NotApprover text={NOT_APPROVER_TEXT} />;

  const params = await searchParams;
  const n = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  const notice = n ? NOTICES[n] : undefined;
  const rules = await listPolicies();

  return (
    <div className="stack">
      {notice && <p className={`notice ${notice.tone}`}>{notice.text}</p>}

      <section className="panel">
        <div className="panel-head"><h2>New policy</h2><span className="meta">pattern is a case-insensitive regular expression</span></div>
        <form action={createPolicyAction} className="policy-form">
          <label>Name<input name="name" required maxLength={80} placeholder="No refunds over the weekend" /></label>
          <label>Pattern<input name="pattern" required maxLength={200} placeholder="refund|payout" /></label>
          <label>Match on
            <select name="match_on" defaultValue="any">
              <option value="any">Anything in the action</option>
              <option value="action_type">Action type</option>
              <option value="target">Target</option>
              <option value="payload">Payload</option>
            </select>
          </label>
          <label>What happens
            <select name="effect" defaultValue="require_approval">
              <option value="require_approval">{EFFECT_TEXT.require_approval}</option>
              <option value="deny">{EFFECT_TEXT.deny}</option>
              <option value="allow">{EFFECT_TEXT.allow} (needs MFA)</option>
            </select>
          </label>
          <label>Only for agent (optional)<input name="agent_id" maxLength={128} placeholder="leave empty for every agent" /></label>
          <label>Reason shown to the operator (optional)<input name="reason" maxLength={300} /></label>
          <div><button className="btn btn-primary">Create policy</button></div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Active rules</h2><span className="meta">{rules.length} total</span></div>
        {rules.length === 0 ? (
          <p className="empty">No policies yet. Built-in rules and Gemini still score every action.</p>
        ) : (
          rules.map((r) => (
            <div key={r.id} className={`policy-row ${r.enabled ? "" : "off"}`}>
              <strong>{r.name}</strong>
              <span>{EFFECT_TEXT[r.effect]} · {r.match_on === "any" ? "anything" : r.match_on} · {r.agent_id ?? "all agents"}</span>
              <code>{r.pattern}</code>
              {r.reason && <span>{r.reason}</span>}
              <div className="actions" style={{ marginTop: 6 }}>
                <form action={togglePolicyAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="enable" value={r.enabled ? "0" : "1"} />
                  <button className="btn btn-sm">{r.enabled ? "Turn off" : "Turn on"}</button>
                </form>
                <form action={deletePolicyAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn btn-sm btn-danger">Delete</button>
                </form>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
