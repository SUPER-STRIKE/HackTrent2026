import type { ReactNode } from "react";

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function RiskBadge({ level, score }: { level: string | null; score?: number | null }) {
  return (
    <span className={`badge lvl-${level ?? "none"}`}>
      {level ?? "unscored"}
      {score !== null && score !== undefined ? ` ${score.toFixed(2)}` : ""}
    </span>
  );
}

export function StatusTag({ status }: { status: string }) {
  return <span className={`tag st-${status}`}>{status}</span>;
}

/** Row class that paints the left risk rail. */
export const railClass = (level: string | null) => (level ? `r-${level}` : "");

export function NotApprover({ text }: { text: string }) {
  return <p className="notice warn">{text}</p>;
}
