import type { ReactNode } from "react";
import type { RiskFactor } from "@/lib/scoring-core";

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

const KIND_LABEL: Record<RiskFactor["kind"], string> = {
  rule: "Built-in rule",
  model: "Gemini",
  baseline: "Unusual for this agent",
  history: "Past decisions",
  policy: "Policy",
};

/** Why the action got its score, one line per contributing factor. */
export function WhyScore({ factors }: { factors: RiskFactor[] | null }) {
  if (!factors || factors.length === 0) return null;
  return (
    <details className="why">
      <summary>Why this score</summary>
      <ul>
        {factors.map((f, i) => (
          <li key={i}>
            <span className={`why-kind k-${f.kind}`}>{KIND_LABEL[f.kind]}</span>
            <span className="why-label">{f.label}</span>
            <span className="why-num">
              {f.delta !== undefined ? `${f.delta > 0 ? "+" : ""}${f.delta.toFixed(2)}` : f.score !== undefined ? f.score.toFixed(2) : ""}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
