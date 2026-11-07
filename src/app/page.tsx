import Link from "next/link";
import { Suspense } from "react";
import { auth0 } from "@/lib/auth0";

export const instant = false;

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>Every agent action, scored before it runs.</h1>
        <p>
          Tripwire records what your AI agents do, scores the risk of each action with Gemini, and holds the dangerous ones until a person approves with MFA.
        </p>
        <Suspense fallback={null}>
          <Cta />
        </Suspense>
      </section>
      <div className="panel">
        <div className="flow">
          <div><b>Report</b><span>Agents send each action before running it.</span></div>
          <div><b>Score</b><span>Rules and Gemini rate the risk from 0 to 1.</span></div>
          <div><b>Hold</b><span>High-risk actions pause for a human.</span></div>
          <div><b>Approve</b><span>An approver confirms with MFA. Everything is logged.</span></div>
        </div>
      </div>
    </>
  );
}

async function Cta() {
  const session = await auth0.getSession();
  if (!session) return <Link className="btn btn-primary" href="/auth/login">Log in to the console</Link>;
  return (
    <div className="actions">
      <Link className="btn btn-primary" href="/dashboard">Open dashboard</Link>
      <Link className="btn" href="/approvals">Review approvals</Link>
    </div>
  );
}
