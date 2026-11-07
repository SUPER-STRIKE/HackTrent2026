import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { isApprover } from "@/lib/approvers";
import { listPending, listRecentDecisions, type AgentEvent } from "@/lib/events";
import { hasFreshStepUp } from "@/lib/step-up";
import { approveAction, denyAction } from "./actions";

export const instant = false;

const NOTICES: Record<string, { text: string; tone: "ok" | "warn" }> = {
  approved: { text: "Approved. The agent will resume.", tone: "ok" },
  denied: { text: "Denied. The agent will not run this action.", tone: "ok" },
  "already-decided": { text: "That action was already decided.", tone: "warn" },
  invalid: { text: "Unknown action.", tone: "warn" },
  "not-approver": { text: "Your account is not on the approver list (APPROVER_EMAILS), or its email is not verified.", tone: "warn" },
};

const LEVEL_STYLE: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

export default function ApprovalsPage({ searchParams }: PageProps<"/approvals">) {
  return (
    <main className="mx-auto w-full max-w-4xl p-6 sm:p-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Approvals</h1>
          <p className="text-sm text-gray-500">Risky agent actions wait here. Approving needs MFA.</p>
        </div>
        <Link className="text-sm text-gray-500 underline" href="/">Home</Link>
      </header>
      <Suspense fallback={<p className="text-gray-500">Loading…</p>}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Queue({ searchParams }: { searchParams: PageProps<"/approvals">["searchParams"] }) {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/approvals");

  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const notice = NOTICES[one(params.notice) ?? ""];
  const confirmId = one(params.confirm);

  const approver = isApprover(session.user);
  const stepUpReady = hasFreshStepUp(session);
  const [pending, decided] = await Promise.all([listPending(), listRecentDecisions()]);

  return (
    <div className="flex flex-col gap-8">
      {notice && (
        <p className={`rounded px-4 py-3 text-sm ${notice.tone === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          {notice.text}
        </p>
      )}
      {!approver && !notice && (
        <p className="rounded bg-amber-50 px-4 py-3 text-sm text-amber-900">{NOTICES["not-approver"].text}</p>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="rounded border border-dashed px-4 py-6 text-center text-gray-500">No actions are waiting.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((e) => (
              <PendingCard key={e.id} event={e} canDecide={approver} confirming={confirmId === e.id && stepUpReady} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent decisions</h2>
        {decided.length === 0 ? (
          <p className="text-sm text-gray-500">None in the last 7 days.</p>
        ) : (
          <ul className="divide-y rounded border text-sm">
            {decided.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                <span className={`font-semibold ${e.status === "approved" ? "text-emerald-700" : "text-red-700"}`}>{e.status}</span>
                <code className="break-all">{e.action_type}</code>
                <span className="text-gray-500">by {e.decided_by}</span>
                <span className="ml-auto text-gray-400">{e.decided_at ? new Date(e.decided_at).toLocaleString() : ""}</span>
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
  return (
    <li className={`rounded border p-4 ${confirming ? "border-emerald-500 ring-2 ring-emerald-200" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        {e.risk_level && (
          <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${LEVEL_STYLE[e.risk_level] ?? ""}`}>
            {e.risk_level} {e.risk_score !== null ? e.risk_score.toFixed(2) : ""}
          </span>
        )}
        <code className="font-semibold break-all">{e.action_type}</code>
        {e.target && <code className="break-all text-gray-600">→ {e.target}</code>}
      </div>
      {e.risk_reason && <p className="mt-2 text-sm">{e.risk_reason}</p>}
      <p className="mt-1 text-xs text-gray-500">
        {e.agent_name ?? e.agent_id} · session {e.session_id} · {new Date(e.time).toLocaleString()}
      </p>
      {payload !== "{}" && (
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-gray-50 p-2 text-xs">{payload.slice(0, 4000)}</pre>
      )}
      {canDecide && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <form action={approveAction}>
            <input type="hidden" name="id" value={e.id} />
            <button className="rounded bg-black px-3 py-1.5 text-sm text-white">
              {confirming ? "MFA verified: confirm approval" : "Approve with MFA"}
            </button>
          </form>
          <form action={denyAction}>
            <input type="hidden" name="id" value={e.id} />
            <button className="rounded border px-3 py-1.5 text-sm">Deny</button>
          </form>
        </div>
      )}
    </li>
  );
}
