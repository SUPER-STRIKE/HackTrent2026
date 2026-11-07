import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { canView, NOT_APPROVER_TEXT } from "@/lib/approvers";
import { getDashboardData } from "@/lib/dashboard";
import { NotApprover, PageHead } from "@/components/ui";
import { LiveDashboard } from "./live-dashboard";

export const instant = false;

export default function DashboardPage() {
  return (
    <>
      <PageHead title="Dashboard" sub="What your agents are doing right now." />
      <Suspense fallback={<p className="loading">Loading…</p>}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/dashboard");
  if (!canView(session.user)) return <NotApprover text={NOT_APPROVER_TEXT} />;
  return <LiveDashboard initial={await getDashboardData()} />;
}
