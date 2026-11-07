import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { isApprover } from "@/lib/approvers";
import { listPending, listRecentDecisions, type AgentEvent } from "@/lib/events";
import { ensureDemoData } from "@/lib/demo";
import { stepUpState, type StepUpState } from "@/lib/step-up";
import { WhyScore, PageHead, RiskBadge, StatusTag, railClass } from "@/components/ui";
import { approveAction, denyAction } from "./actions";

export const instant = false;

const NOTICES: Record<string, { text: string; tone: "ok" | "warn" }> = {
  approved: { text: "Approved. The agent will resume.", tone: "ok" },
  denied: { text: "Denied. The agent will not run this action.", tone: "ok" },
  "already-decided": { text: "That action was already decided.", tone: "warn" },
  invalid: { text: "Unknown action.", tone: "warn" },
  "not-approver": { text: "Your account is not on the approver list (APPROVER_EMAILS), or its email is not verified.", tone: "warn" },
};

export default function ApprovalsPage({ searchParams }: PageProps<"/approvals">) {
  return (
    <>
      <PageHead title="Approvals" sub="Risky agent actions wait here. Approving needs a fresh MFA check." />
      <Suspense fallback={<p className="loading">Loading…</p>}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Queue({ searchParams }: { searchParams: PageProps<"/approvals">["searchParams"] }) {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/approvals");

  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const notice = NOTICES[one(params.notice) ?? ""];
  const confirmId = one(params.confirm);

  await ensureDemoData();
  const approver = isApprover(session.user);
  const stepUp = await stepUpState(session);
  const stepUpReady = stepUp.ok;
  // Back from the MFA login but it cannot approve: say why instead of looping through login again.
  const mfaProblem = confirmId && !stepUpReady ? mfaProblemText(stepUp) : null;
  const [pending, decided] = await Promise.all([listPending(), listRecentDecisions()]);

  return (
    <div className="stack">
      {mfaProblem ? <p className="notice warn">{mfaProblem}</p> : notice && <p className={`notice ${notice.tone}`}>{notice.text}</p>}
      {!approver && !notice && <p className="notice warn">{NOTICES["not-approver"].text}</p>}

      <section className="panel">
        <div className="panel-head">
          <h2>Waiting for a decision</h2>
          <span className="meta">{pending.length} pending</span>
        </div>
        {pending.length === 0 ? (
          <p className="empty">Nothing is waiting. New risky actions will appear here.</p>
        ) : (
          <ul className="log">
            {pending.map((e) => (
              <PendingCard key={e.id} event={e} canDecide={approver} confirming={confirmId === e.id && stepUpReady} returned={confirmId === e.id} />
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Recent decisions</h2>
          <span className="meta">last 7 days</span>
        </div>
        {decided.length === 0 ? (
          <p className="empty">No decisions yet.</p>
        ) : (
          <ul className="log">
            {decided.map((e) => (
              <li key={e.id} className={`row ${railClass(e.risk_level)}`}>
                <StatusTag status={e.status} />
                <span className="act">{e.action_type}</span>
                {e.target && <span className="tgt">{e.target}</span>}
                <span className="who">by {e.decided_by}</span>
                <span className="end who">{e.decided_at ? new Date(e.decided_at).toLocaleString() : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function mfaProblemText(s: StepUpState): string {
  if (s.reason === "no-mfa")
    return `Sign-in finished but Auth0 did not report MFA for this login (amr: ${s.amr.length ? s.amr.join(", ") : "none"}). In Auth0, check that an MFA factor is enabled, the step-up Action is deployed and added to the Login flow, and your user is enrolled in MFA.`;
  if (s.reason === "stale") return `The MFA login is ${s.ageSeconds ?? "?"} seconds old, over the 5 minute limit. Press Approve with MFA to sign in again.`;
  if (s.reason === "spent") return "This MFA login was already used for another approval. Each approval needs its own MFA check: press Approve with MFA to sign in again.";
  return "";
}

function PendingCard({ event: e, canDecide, confirming, returned }: { event: AgentEvent; canDecide: boolean; confirming: boolean; returned: boolean }) {
  const payload = JSON.stringify(e.payload, null, 2);
  return (
    <li className={`pending ${railClass(e.risk_level)} ${confirming ? "confirming" : ""}`}>
      <div className="pending-top">
        <RiskBadge level={e.risk_level} score={e.risk_score} />
        <span className="act">{e.action_type}</span>
        {e.target && <span className="tgt">{e.target}</span>}
      </div>
      {e.risk_reason && <p className="reason">{e.risk_reason}</p>}
      <WhyScore factors={e.risk_factors} />
      <dl className="kv">
        <dt>Agent</dt><dd>{e.agent_name ?? e.agent_id}</dd>
        <dt>Session</dt><dd>{e.session_id}</dd>
        <dt>Reported</dt><dd>{new Date(e.time).toLocaleString()}</dd>
      </dl>
      {payload !== "{}" && <pre className="payload">{payload.slice(0, 4000)}</pre>}
      {canDecide && (
        <div className="actions">
          <form action={approveAction}>
            <input type="hidden" name="id" value={e.id} />
            {returned && <input type="hidden" name="returned" value="1" />}
            <button className="btn btn-primary">{confirming ? "MFA verified: confirm approval" : "Approve with MFA"}</button>
          </form>
          <form action={denyAction}>
            <input type="hidden" name="id" value={e.id} />
            <button className="btn btn-danger">Deny</button>
          </form>
        </div>
      )}
    </li>
  );
}
