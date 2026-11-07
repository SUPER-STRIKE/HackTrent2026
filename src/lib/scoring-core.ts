/**
 * Pure scoring logic with no I/O, so it can be unit tested (see tests/scoring-core.test.ts).
 *
 * The final risk of an action is built from named factors, so a human can see why it got its score:
 *   rule      built-in pattern (floor the model cannot talk down)
 *   model     Gemini's score
 *   baseline  the agent is doing something unusual for itself
 *   history   what humans decided about the same action before (the feedback loop)
 *   policy    a rule written by the team
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type FactorKind = "rule" | "model" | "baseline" | "history" | "policy";

export type RiskFactor = {
  kind: FactorKind;
  label: string;
  /** Score this factor alone would give (rule, model, policy). */
  score?: number;
  /** Amount this factor added to or removed from the score (baseline, history). */
  delta?: number;
};

export type PolicyEffect = "deny" | "require_approval" | "allow";
export type PolicyMatchOn = "any" | "action_type" | "target" | "payload";

export type PolicyRule = {
  id: string;
  name: string;
  pattern: string;
  match_on: PolicyMatchOn;
  agent_id: string | null;
  effect: PolicyEffect;
  reason: string | null;
};

export type ActionShape = {
  agent_id: string;
  action_type: string;
  target?: string;
  payload?: Record<string, unknown>;
};

export function levelFor(score: number): RiskLevel {
  if (score >= 0.9) return "critical";
  if (score >= 0.7) return "high";
  if (score >= 0.3) return "medium";
  return "low";
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- policies ----------

export const MAX_PATTERN_LENGTH = 200;

/** Returns an error message, or null when the pattern is a usable regular expression. */
export function validatePattern(pattern: string): string | null {
  if (!pattern.trim()) return "Pattern is required.";
  if (pattern.length > MAX_PATTERN_LENGTH) return `Pattern is longer than ${MAX_PATTERN_LENGTH} characters.`;
  try {
    new RegExp(pattern, "i");
  } catch {
    return "Pattern is not a valid regular expression.";
  }
  return null;
}

function policyText(rule: PolicyRule, a: ActionShape): string {
  switch (rule.match_on) {
    case "action_type":
      return a.action_type;
    case "target":
      return a.target ?? "";
    case "payload":
      return JSON.stringify(a.payload ?? {});
    default:
      return [a.action_type, a.target ?? "", JSON.stringify(a.payload ?? {})].join("\n");
  }
}

export type PolicyOutcome = { deny?: PolicyRule; require?: PolicyRule; allow?: PolicyRule };

/** First matching rule per effect. Rules scoped to another agent are ignored. */
export function evaluatePolicies(rules: PolicyRule[], action: ActionShape): PolicyOutcome {
  const out: PolicyOutcome = {};
  for (const rule of rules) {
    if (rule.agent_id && rule.agent_id !== action.agent_id) continue;
    let hit = false;
    try {
      hit = new RegExp(rule.pattern, "i").test(policyText(rule, action));
    } catch {
      continue; // a bad stored pattern must never break ingest
    }
    if (!hit) continue;
    if (rule.effect === "deny") out.deny ??= rule;
    else if (rule.effect === "require_approval") out.require ??= rule;
    else out.allow ??= rule;
  }
  return out;
}

// ---------- baseline and history ----------

export type AgentStats = {
  /** Events by this agent in the lookback window. */
  total: number;
  /** Of those, how many had this action_type. */
  type_count: number;
  /** Events in the last hour. */
  last_hour: number;
  /** Hours between the agent's first event in the window and now. */
  span_hours: number;
  /** Human decisions on the same action_type and target. */
  approved: number;
  denied: number;
};

export const BASELINE_MIN_EVENTS = 20;
export const HISTORY_MIN_APPROVALS = 3;

/** Unusual-for-this-agent adjustments. Needs enough history to mean anything. */
export function baselineFactors(s: AgentStats): RiskFactor[] {
  const out: RiskFactor[] = [];
  if (s.total < BASELINE_MIN_EVENTS) return out;
  if (s.type_count === 0) {
    out.push({ kind: "baseline", label: "First time this agent has done this kind of action", delta: 0.15 });
  }
  const priorPerHour = (s.total - s.last_hour) / Math.max(1, s.span_hours);
  if (s.last_hour >= 20 && s.last_hour > priorPerHour * 5) {
    out.push({
      kind: "baseline",
      label: `Activity spike: ${s.last_hour} actions in the last hour, usually about ${Math.round(priorPerHour)}`,
      delta: 0.1,
    });
  }
  return out;
}

/** What humans decided before about this exact action. Denials raise risk, repeated approvals lower it a little. */
export function historyFactors(s: AgentStats): RiskFactor[] {
  if (s.denied > 0 && s.denied >= s.approved) {
    return [{ kind: "history", label: `Humans denied this same action ${s.denied} time${s.denied === 1 ? "" : "s"} before`, delta: 0.1 }];
  }
  if (s.approved >= HISTORY_MIN_APPROVALS && s.denied === 0) {
    return [{ kind: "history", label: `Humans approved this same action ${s.approved} times before and never denied it`, delta: -0.15 }];
  }
  return [];
}

// ---------- combine ----------

export type BaseScore = { score: number; reason: string; source: "rules" | "gemini" | "fallback"; factors: RiskFactor[] };

export type Assessment = {
  score: number;
  level: RiskLevel;
  reason: string;
  source: "rules" | "gemini" | "fallback" | "policy";
  factors: RiskFactor[];
  /** What the server should do with the action. */
  decision: "deny" | "hold" | "allow";
  /** Policy rule that decided it, if any. */
  policy: PolicyRule | null;
};

/** Built-in rules at or above this are never lowered by history or an allow policy. */
const PROTECTED_FLOOR = 0.9;

export function combine(input: {
  base: BaseScore;
  /** Highest built-in rule score, used as the floor for downward adjustments. */
  rulesScore: number;
  stats: AgentStats | null;
  policy: PolicyOutcome;
  threshold: number;
}): Assessment {
  const { base, rulesScore, stats, policy, threshold } = input;
  const factors: RiskFactor[] = [...base.factors];

  // A deny policy decides alone; nothing else matters.
  if (policy.deny) {
    factors.unshift({ kind: "policy", label: `Blocked by policy "${policy.deny.name}"`, score: 1 });
    return {
      score: 1,
      level: "critical",
      reason: policy.deny.reason?.trim() || `Blocked by policy "${policy.deny.name}"`,
      source: "policy",
      factors,
      decision: "deny",
      policy: policy.deny,
    };
  }

  let score = base.score;
  const adjustments: RiskFactor[] = [...(stats ? baselineFactors(stats) : []), ...(stats ? historyFactors(stats) : [])];
  for (const f of adjustments) {
    let delta = f.delta ?? 0;
    if (delta < 0 && (rulesScore >= PROTECTED_FLOOR || policy.require)) delta = 0; // never relax a protected action
    if (delta === 0 && (f.delta ?? 0) < 0) continue;
    const next = clamp01(score + delta);
    // Downward moves cannot go under the built-in rule floor.
    const bounded = delta < 0 ? Math.max(next, rulesScore) : next;
    const applied = round2(bounded - score);
    if (applied !== 0) factors.push({ ...f, delta: applied });
    score = bounded;
  }

  let reason = base.reason;
  let source: Assessment["source"] = base.source;
  let decision: Assessment["decision"] = score >= threshold ? "hold" : "allow";
  let matched: PolicyRule | null = null;

  if (policy.require) {
    factors.unshift({ kind: "policy", label: `Policy "${policy.require.name}" requires approval`, score: Math.max(score, threshold) });
    score = Math.max(score, threshold);
    decision = "hold";
    source = "policy";
    reason = policy.require.reason?.trim() || `Policy "${policy.require.name}" requires approval`;
    matched = policy.require;
  } else if (policy.allow && rulesScore < PROTECTED_FLOOR && base.source !== "fallback") {
    const capped = Math.min(score, round2(threshold - 0.01));
    if (capped < score) {
      factors.unshift({ kind: "policy", label: `Policy "${policy.allow.name}" allows this action`, delta: round2(capped - score) });
      score = capped;
      decision = "allow";
      source = "policy";
      reason = policy.allow.reason?.trim() || `Allowed by policy "${policy.allow.name}"`;
      matched = policy.allow;
    }
  }

  score = round2(clamp01(score));
  return { score, level: levelFor(score), reason, source, factors, decision, policy: matched };
}
