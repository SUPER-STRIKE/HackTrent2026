import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { Chat } from "./chat";

export const instant = false;

export default function InvestigatorPage() {
  return (
    <main className="mx-auto w-full max-w-3xl p-6 sm:p-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Investigator</h1>
          <p className="text-sm text-gray-500">Ask Gemini what your agents did. Answers come from the audit log.</p>
        </div>
        <nav className="flex gap-4 text-sm text-gray-500 underline">
          <Link href="/incidents">Incidents</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/">Home</Link>
        </nav>
      </header>
      <Suspense fallback={<p className="text-gray-500">Loading…</p>}>
        <Gate />
      </Suspense>
    </main>
  );
}

async function Gate() {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/investigator");
  return <Chat />;
}
