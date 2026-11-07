import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { isApprover } from "@/lib/approvers";
import { listPending, listRecentDecisions, type AgentEvent } from "@/lib/events";
import { ensureDemoData } from "@/lib/demo";
import { hasFreshStepUp } from "@/lib/step-up";
import { PageHead, RiskBadge, StatusTag, railClass } from "@/components/ui";
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
      <Suspense fallback={<p className="mono-dim">Loading…</p>}>
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
  const stepUpReady = await hasFreshStepUp(session);
  const [pending, decided] = await Promise.all([listPending(), listRecentDecisions()]);

  return (
    <div className="stack">
      {notice && <p className={`notice ${notice.tone}`}>{notice.text}</p>}
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
              <PendingCard key={e.id} event={e} canDecide={approver} confirming={confirmId === e.id && stepUpReady} />
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
                <span className="end mono-dim">{e.decided_at ? new Date(e.decided_at).toLocaleString() : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PendingCard({ event: e, canDecide, confirming }: { event: AgentEvent; canDecide: boolean; confirming: boolean }) {
  const payload = JSON.stringify(e.payload, null, 2);
  const rail = e.risk_level === "critical" ? "crit" : e.risk_level === "high" ? "high" : "med";
  return (
    <li className={`pending ${confirming ? "confirming" : ""}`} style={{ ["--rail" as string]: `var(--sig-${rail})` }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <RiskBadge level={e.risk_level} score={e.risk_score} />
        <span className="act">{e.action_type}</span>
        {e.target && <span className="tgt">{e.target}</span>}
      </div>
      {e.risk_reason && <p style={{ margin: "8px 0 0" }}>{e.risk_reason}</p>}
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
