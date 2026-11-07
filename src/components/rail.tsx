import Link from "next/link";
import { Suspense } from "react";
import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { Nav } from "./nav";

/** Shield crossed by a tripwire. */
export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2 20.5 5.5v6c0 5-3.5 8.5-8.5 10.5C7 20 3.5 16.5 3.5 11.5v-6L12 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M1.5 12.5h21" stroke="var(--orange)" strokeWidth="2" strokeDasharray="3 2" />
    </svg>
  );
}

async function PendingNav() {
  const session = await auth0.getSession();
  let pending = 0;
  if (session) {
    try {
      const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM agent_events WHERE status = 'pending'");
      pending = rows[0]?.n ?? 0;
    } catch {
      // The rail must render even if the database is down.
    }
  }
  return <Nav pending={pending} />;
}

async function Account() {
  const session = await auth0.getSession();
  if (!session) {
    return <Link className="btn btn-orange btn-sm" href="/auth/login">Log in</Link>;
  }
  return (
    <>
      <span className="who">{session.user.email ?? session.user.sub}</span>
      <a className="logout" href="/auth/logout">Log out</a>
    </>
  );
}

export function Rail() {
  return (
    <aside className="rail">
      <Link href="/" className="brand" aria-label="Tripwire home">
        <BrandMark />
        <span className="brand-name">Tripwire</span>
      </Link>
      <Suspense fallback={<Nav pending={0} />}>
        <PendingNav />
      </Suspense>
      <div className="rail-foot">
        <Suspense fallback={null}>
          <Account />
        </Suspense>
      </div>
    </aside>
  );
}
