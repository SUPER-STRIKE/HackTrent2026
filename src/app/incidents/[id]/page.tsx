import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { isApprover, NOT_APPROVER_TEXT } from "@/lib/approvers";
import { geminiConfigured } from "@/lib/gemini";
import { findSimilar, getEvent, getSessionContext, summarizeIncident } from "@/lib/incidents";

export const instant = false;

export default function IncidentPage({ params }: PageProps<"/incidents/[id]">) {
  return (
    <main className="mx-auto w-full max-w-4xl p-6 sm:p-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Incident</h1>
        <nav className="flex gap-4 text-sm text-gray-500 underline">
          <Link href="/incidents">All incidents</Link>
          <Link href="/investigator">Investigator</Link>
        </nav>
      </header>
      <Suspense fallback={<p className="text-gray-500">Loading…</p>}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

async function Detail({ params }: { params: PageProps<"/incidents/[id]">["params"] }) {
  const { id } = await params;
  const session = await auth0.getSession();
  if (!session) redirect(`/auth/login?returnTo=/incidents/${encodeURIComponent(id)}`);
  if (!isApprover(session.user)) return <p className="rounded bg-amber-50 px-4 py-3 text-sm text-amber-900">{NOT_APPROVER_TEXT}</p>;

  const event = await getEvent(id);
  if (!event) notFound();

  const payload = JSON.stringify(event.payload, null, 2);
  return (
    <div className="flex flex-col gap-8">
      <section className="rounded border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <code className="font-semibold break-all">{event.action_type}</code>
          {event.target && <code className="break-all text-gray-600">→ {event.target}</code>}
        </div>
        <p className="mt-2 text-sm">
          Risk {event.risk_score?.toFixed(2) ?? "n/a"} ({event.risk_level ?? "unscored"}) · {event.status}
          {event.decided_by ? ` by ${event.decided_by}` : ""}
        </p>
        {event.risk_reason && <p className="mt-1 text-sm text-gray-600">{event.risk_reason}</p>}
        <p className="mt-1 text-xs text-gray-500">
          {event.agent_name ?? event.agent_id} · session {event.session_id} · {new Date(event.time).toLocaleString()}
        </p>
        {payload !== "{}" && <pre className="mt-2 max-h-48 overflow-auto rounded bg-gray-50 p-2 text-xs">{payload.slice(0, 4000)}</pre>}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Summary</h2>
        <Suspense fallback={<p className="text-sm text-gray-400">Gemini is writing the summary…</p>}>
          <Summary id={id} />
        </Suspense>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Similar past incidents</h2>
        <Suspense fallback={<p className="text-sm text-gray-400">Searching…</p>}>
          <Similar id={id} />
        </Suspense>
      </section>
    </div>
  );
}

async function Summary({ id }: { id: string }) {
  const event = await getEvent(id);
  if (!event) return null;
  if (!geminiConfigured()) return <p className="text-sm text-gray-500">Set GEMINI_API_KEY to get AI summaries.</p>;
  const text = await summarizeIncident(event, await getSessionContext(event)).catch((err) => {
    console.error("incident summary failed", err instanceof Error ? err.message : err);
    return null;
  });
  if (text === null) return <p className="text-sm text-amber-800">The summary is unavailable right now. Reload to retry.</p>;
  return <p className="whitespace-pre-wrap rounded bg-gray-50 p-4 text-sm">{text}</p>;
}

async function Similar({ id }: { id: string }) {
  const event = await getEvent(id);
  if (!event) return null;
  const similar = await findSimilar(event);
  if (similar.length === 0) return <p className="text-sm text-gray-500">No similar incidents found.</p>;
  return (
    <ul className="divide-y rounded border text-sm">
      {similar.map(({ event: e, similarity }) => (
        <li key={e.id}>
          <Link href={`/incidents/${e.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 hover:bg-gray-50">
            <span className="w-12 shrink-0 font-semibold">{Math.round(similarity * 100)}%</span>
            <code className="break-all">{e.action_type}</code>
            {e.target && <code className="break-all text-gray-500">→ {e.target}</code>}
            <span className="ml-auto text-xs text-gray-400">{e.status} · {new Date(e.time).toLocaleString()}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
