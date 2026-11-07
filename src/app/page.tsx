import Link from "next/link";
import { auth0 } from "@/lib/auth0";

export const instant = false;

export default async function Home() {
  const session = await auth0.getSession();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold">Tripwire</h1>
      <p className="text-gray-500">Flight recorder and seatbelt for AI agents.</p>
      {session ? (
        <>
          <p>Logged in as {session.user.email}</p>
          <a className="underline" href="/dashboard">
            Live dashboard
          </a>
          <a className="underline" href="/investigator">
            Investigator
          </a>
          <Link className="underline" href="/incidents">
            Incidents
          </Link>
          <a className="underline" href="/approvals">
            Approvals queue
          </a>
          <a className="rounded bg-black px-4 py-2 text-white" href="/auth/logout">
            Log out
          </a>
        </>
      ) : (
        <a className="rounded bg-black px-4 py-2 text-white" href="/auth/login">
          Log in
        </a>
      )}
    </main>
  );
}
