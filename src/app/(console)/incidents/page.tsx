import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { isApprover, NOT_APPROVER_TEXT } from "@/lib/approvers";
import { ensureDemoData } from "@/lib/demo";
import { listIncidents } from "@/lib/incidents";
import { NotApprover, PageHead, RiskBadge, StatusTag, railClass } from "@/components/ui";

export const instant = false;

export default function IncidentsPage() {
  return (
    <>
      <PageHead title="Incidents" sub="Actions that were high risk, held or denied. Open one for a summary and similar past cases." />
      <Suspense fallback={<p className="loading">Loading…</p>}>
        <List />
      </Suspense>
    </>
  );
}

async function List() {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/incidents");
  if (!isApprover(session.user)) return <NotApprover text={NOT_APPROVER_TEXT} />;
  await ensureDemoData();
  const incidents = await listIncidents();
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Latest incidents</h2>
        <span className="meta">{incidents.length} shown</span>
      </div>
      {incidents.length === 0 ? (
        <p className="empty">No incidents yet. Risky actions will be listed here.</p>
      ) : (
        <ul className="log">
          {incidents.map((e) => (
            <li key={e.id}>
              <Link href={`/incidents/${e.id}`} className={`row ${railClass(e.risk_level)}`}>
                <span className="time">{new Date(e.time).toLocaleTimeString()}</span>
                <RiskBadge level={e.risk_level} score={e.risk_score} />
                <span className="act">{e.action_type}</span>
                {e.target && <span className="tgt">{e.target}</span>}
                <span className="who">{e.agent_name ?? e.agent_id}</span>
                <span className="end"><StatusTag status={e.status} /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
