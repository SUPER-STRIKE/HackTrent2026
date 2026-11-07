import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { isApprover, NOT_APPROVER_TEXT } from "@/lib/approvers";
import { listIncidents } from "@/lib/incidents";

export const instant = false;

const LEVEL_STYLE: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

export default function IncidentsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl p-6 sm:p-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Incidents</h1>
          <p className="text-sm text-gray-500">Risky, held or denied actions. Open one for a summary and similar past incidents.</p>
        </div>
        <nav className="flex gap-4 text-sm text-gray-500 underline">
          <Link href="/investigator">Investigator</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/">Home</Link>
        </nav>
      </header>
      <Suspense fallback={<p className="text-gray-500">Loading…</p>}>
        <List />
      </Suspense>
    </main>
  );
}

async function List() {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/incidents");
  if (!isApprover(session.user)) return <p className="rounded bg-amber-50 px-4 py-3 text-sm text-amber-900">{NOT_APPROVER_TEXT}</p>;
  const incidents = await listIncidents();
  if (incidents.length === 0) {
    return <p className="rounded border border-dashed px-4 py-6 text-center text-gray-500">No incidents yet.</p>;
  }
  return (
    <ul className="divide-y rounded border text-sm">
      {incidents.map((e) => (
        <li key={e.id}>
          <Link href={`/incidents/${e.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-gray-50">
            {e.risk_level && <span className={`rounded px-1.5 py-0.5 text-xs font-semibold uppercase ${LEVEL_STYLE[e.risk_level] ?? ""}`}>{e.risk_level}</span>}
            <code className="font-semibold break-all">{e.action_type}</code>
            {e.target && <code className="break-all text-gray-500">→ {e.target}</code>}
            <span className="text-xs text-gray-400">{e.agent_name ?? e.agent_id}</span>
            <span className="ml-auto text-xs text-gray-400">{e.status} · {new Date(e.time).toLocaleString()}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
