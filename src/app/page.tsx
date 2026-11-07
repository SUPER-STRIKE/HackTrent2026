import Link from "next/link";
import { Suspense } from "react";
import { auth0 } from "@/lib/auth0";
import { BrandMark } from "@/components/rail";
import { Recorder } from "@/components/recorder";

export const instant = false;

export default function Home() {
  return (
    <div className="intro">
      <header className="topbar">
        <Link href="/" className="brand" aria-label="Tripwire home">
          <BrandMark />
          <span className="brand-name">Tripwire</span>
        </Link>
        <Suspense fallback={null}>
          <TopActions />
        </Suspense>
      </header>

      <main className="intro-main">
        <div className="intro-copy">
          <h1>Every agent action, scored before it runs.</h1>
          <p>Tripwire records what your AI agents do and holds the risky actions until a person approves with MFA.</p>
          <Suspense fallback={<div className="actions" />}>
            <Cta />
          </Suspense>
        </div>

        <Recorder />

        <ol className="steps">
          <li><b>Report</b><span>Agents send each action before running it.</span></li>
          <li><b>Score</b><span>Rules and Gemini rate the risk from 0 to 1.</span></li>
          <li><b>Hold</b><span>Anything over the tripwire pauses for a human.</span></li>
          <li><b>Approve</b><span>An approver confirms with MFA. Every step is logged.</span></li>
        </ol>
      </main>
    </div>
  );
}

async function TopActions() {
  const session = await auth0.getSession();
  if (session) return <Link className="btn btn-sm" href="/dashboard">Open console</Link>;
  return <Link className="btn btn-sm" href="/auth/login">Log in</Link>;
}

async function Cta() {
  const session = await auth0.getSession();
  if (!session) {
    return (
      <div className="actions">
        <Link className="btn btn-primary" href="/auth/login?returnTo=/dashboard">Log in to the console</Link>
      </div>
    );
  }
  return (
    <div className="actions">
      <Link className="btn btn-primary" href="/dashboard">Open dashboard</Link>
      <Link className="btn" href="/approvals">Review approvals</Link>
    </div>
  );
}
