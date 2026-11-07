import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { getDashboardData } from "@/lib/dashboard";
import { LiveDashboard } from "./live-dashboard";

export const instant = false;

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-5xl p-6 sm:p-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-gray-500">Everything your agents are doing, live.</p>
        </div>
        <nav className="flex gap-4 text-sm text-gray-500 underline">
          <Link href="/incidents">Incidents</Link>
          <Link href="/investigator">Investigator</Link>
          <Link href="/approvals">Approvals</Link>
          <Link href="/">Home</Link>
        </nav>
      </header>
      <Suspense fallback={<p className="text-gray-500">Loading…</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/dashboard");
  return <LiveDashboard initial={await getDashboardData()} />;
}
