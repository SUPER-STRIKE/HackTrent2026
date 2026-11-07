"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: icon(<path d="M2 13V7m4 6V3m4 10V6m4 7V9" />) },
  { href: "/approvals", label: "Approvals", icon: icon(<><path d="M8 1.5 13.5 4v4c0 3-2.3 5.2-5.5 6.5C4.8 13.200 2.500 11 2.500 8V4L8 1.500Z" /><path d="m5.800 8 1.600 1.600L10.400 6.500" /></>) },
  { href: "/incidents", label: "Incidents", icon: icon(<><path d="M8 2 14.500 13.500h-13L8 2Z" /><path d="M8 6.500v3M8 11.500v.01" /></>) },
  { href: "/investigator", label: "Investigator", icon: icon(<><circle cx="7" cy="7" r="4.500" /><path d="m10.500 10.500 3.500 3.500" /></>) },
];

export function Nav({ pending }: { pending: number }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} aria-current={path === i.href || path.startsWith(`${i.href}/`) ? "page" : undefined}>
          {i.icon}
          {i.label}
          {i.href === "/approvals" && pending > 0 && <span className="count" aria-label={`${pending} pending`}>{pending}</span>}
        </Link>
      ))}
    </nav>
  );
}
