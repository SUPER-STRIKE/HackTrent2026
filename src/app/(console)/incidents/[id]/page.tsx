import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { isApprover, NOT_APPROVER_TEXT } from "@/lib/approvers";
import { geminiConfigured } from "@/lib/gemini";
import { findSimilar, getEvent, getSessionContext, summarizeIncident } from "@/lib/incidents";
import { NotApprover, PageHead, RiskBadge, StatusTag, railClass } from "@/components/ui";

export const instant = false;

export default function IncidentPage({ params }: PageProps<"/incidents/[id]">) {
  return (
    <>
      <PageHead title="Incident">
        <Link className="btn btn-sm" href="/incidents">All incidents</Link>
      </PageHead>
      <Suspense fallback={<p className="loading">Loading…</p>}>
        <Detail params={params} />
      </Suspense>
    </>
  );
}

async function Detail({ params }: { params: PageProps<"/incidents/[id]">["params"] }) {
  const { id } = await params;
  const session = await auth0.getSession();
  if (!session) redirect(`/auth/login?returnTo=/incidents/${encodeURIComponent(id)}`);
  if (!isApprover(session.user)) return <NotApprover text={NOT_APPROVER_TEXT} />;

  const event = await getEvent(id);
  if (!event) notFound();

  const payload = JSON.stringify(event.payload, null, 2);
  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <h2>Action</h2>
          <StatusTag status={event.status} />
        </div>
        <div className={`pending ${railClass(event.risk_level)}`}>
          <div className="pending-top">
            <RiskBadge level={event.risk_level} score={event.risk_score} />
            <span className="act">{event.action_type}</span>
            {event.target && <span className="tgt">{event.target}</span>}
          </div>
          {event.risk_reason && <p className="reason">{event.risk_reason}</p>}
          <dl className="kv">
            <dt>Agent</dt><dd>{event.agent_name ?? event.agent_id}</dd>
            <dt>Session</dt><dd>{event.session_id}</dd>
            <dt>Reported</dt><dd>{new Date(event.time).toLocaleString()}</dd>
            {event.decided_by && (<><dt>Decided by</dt><dd>{event.decided_by}</dd></>)}
            <dt>Event id</dt><dd>{event.id}</dd>
          </dl>
          {payload !== "{}" && <pre className="payload">{payload.slice(0, 4000)}</pre>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Summary</h2><span className="meta">written by Gemini</span></div>
        <div className="panel-body">
          <Suspense fallback={<p className="loading" style={{ margin: 0 }}>Writing the summary…</p>}>
            <Summary id={id} />
          </Suspense>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Similar past incidents</h2><span className="meta">matched on action, target and payload</span></div>
        <Suspense fallback={<p className="empty">Searching…</p>}>
          <Similar id={id} />
        </Suspense>
      </section>
    </div>
  );
}

async function Summary({ id }: { id: string }) {
  const event = await getEvent(id);
  if (!event) return null;
  if (!geminiConfigured()) return <p className="loading" style={{ margin: 0 }}>Set GEMINI_API_KEY to get AI summaries.</p>;
  const text = await summarizeIncident(event, await getSessionContext(event)).catch((err) => {
    console.error("incident summary failed", err instanceof Error ? err.message : err);
    return null;
  });
  if (text === null) return <p className="notice warn">The summary is unavailable right now. Reload to retry.</p>;
  return <p className="summary">{text}</p>;
}

async function Similar({ id }: { id: string }) {
  const event = await getEvent(id);
  if (!event) return null;
  const similar = await findSimilar(event);
  if (similar.length === 0) return <p className="empty">No similar incidents found.</p>;
  return (
    <ul className="log">
      {similar.map(({ event: e, similarity }) => (
        <li key={e.id}>
          <Link href={`/incidents/${e.id}`} className={`row ${railClass(e.risk_level)}`}>
            <span className="sim">{Math.round(similarity * 100)}%</span>
            <span className="act">{e.action_type}</span>
            {e.target && <span className="tgt">{e.target}</span>}
            <span className="end"><StatusTag status={e.status} /></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
