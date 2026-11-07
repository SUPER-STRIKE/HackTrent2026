import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { isApprover, NOT_APPROVER_TEXT } from "@/lib/approvers";
import { NotApprover, PageHead } from "@/components/ui";
import { Chat } from "./chat";

export const instant = false;

export default function InvestigatorPage() {
  return (
    <>
      <PageHead title="Investigator" sub="Ask what your agents did. Answers come from the audit log." />
      <Suspense fallback={<p className="mono-dim">Loading…</p>}>
        <Gate />
      </Suspense>
    </>
  );
}

async function Gate() {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/investigator");
  if (!isApprover(session.user)) return <NotApprover text={NOT_APPROVER_TEXT} />;
  return <Chat />;
}
