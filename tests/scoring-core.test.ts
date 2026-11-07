import { test } from "node:test";
import assert from "node:assert/strict";
import { baselineFactors, combine, evaluatePolicies, historyFactors, validatePattern, type AgentStats, type PolicyRule } from "../src/lib/scoring-core.ts";

const base = (score: number, source: "rules" | "gemini" | "fallback" = "gemini") => ({
  score,
  reason: "base",
  source,
  factors: [{ kind: "model" as const, label: "base", score }],
});
const stats = (o: Partial<AgentStats> = {}): AgentStats => ({ total: 100, type_count: 50, last_hour: 2, span_hours: 100, approved: 0, denied: 0, ...o });
const rule = (o: Partial<PolicyRule>): PolicyRule => ({
  id: "1", name: "r", pattern: "refund", match_on: "any", agent_id: null, effect: "require_approval", reason: null, ...o,
});
const act = { agent_id: "a1", action_type: "refund", target: "order-1", payload: {} };
const run = (o: Parameters<typeof combine>[0]) => combine(o);

test("policy matching respects scope and field", () => {
  assert.ok(evaluatePolicies([rule({})], act).require);
  assert.equal(evaluatePolicies([rule({ agent_id: "other" })], act).require, undefined);
  assert.equal(evaluatePolicies([rule({ match_on: "target" })], act).require, undefined);
  assert.ok(evaluatePolicies([rule({ effect: "deny", match_on: "action_type" })], act).deny);
  assert.equal(evaluatePolicies([rule({ pattern: "(" })], act).require, undefined); // bad stored pattern is ignored
});

test("pattern validation", () => {
  assert.equal(validatePattern("refund|payout"), null);
  assert.ok(validatePattern("("));
  assert.ok(validatePattern("   "));
  assert.ok(validatePattern("a".repeat(500)));
});

test("deny policy decides alone", () => {
  const r = run({ base: base(0.1), rulesScore: 0.05, stats: null, policy: { deny: rule({ effect: "deny", name: "no" }) }, threshold: 0.7 });
  assert.equal(r.decision, "deny");
  assert.equal(r.score, 1);
});

test("require policy forces a hold even for a low score", () => {
  const r = run({ base: base(0.1), rulesScore: 0.05, stats: null, policy: { require: rule({}) }, threshold: 0.7 });
  assert.equal(r.decision, "hold");
  assert.ok(r.score >= 0.7);
});

test("allow policy lowers a high model score but never a critical built-in rule", () => {
  const allow = { allow: rule({ effect: "allow" }) };
  const a = run({ base: base(0.8), rulesScore: 0.05, stats: null, policy: allow, threshold: 0.7 });
  assert.equal(a.decision, "allow");
  assert.ok(a.score < 0.7);
  const b = run({ base: base(0.95, "rules"), rulesScore: 0.95, stats: null, policy: allow, threshold: 0.7 });
  assert.equal(b.decision, "hold");
  const c = run({ base: base(0.7, "fallback"), rulesScore: 0.05, stats: null, policy: allow, threshold: 0.7 });
  assert.equal(c.decision, "hold"); // model outage stays fail-closed
});

test("baseline: new action type raises score, but only with enough history", () => {
  assert.equal(baselineFactors(stats({ type_count: 0 })).length, 1);
  assert.equal(baselineFactors(stats({ type_count: 0, total: 5 })).length, 0);
  assert.equal(baselineFactors(stats({ last_hour: 60, total: 100, span_hours: 100 })).length, 1);
  const r = run({ base: base(0.62), rulesScore: 0.05, stats: stats({ type_count: 0 }), policy: {}, threshold: 0.7 });
  assert.equal(r.decision, "hold");
  assert.ok(r.factors.some((f) => f.kind === "baseline" && f.delta === 0.15));
});

test("history: repeated approvals lower, denials raise", () => {
  assert.equal(historyFactors(stats({ approved: 3 }))[0].delta, -0.15);
  assert.equal(historyFactors(stats({ approved: 2 })).length, 0);
  assert.equal(historyFactors(stats({ approved: 5, denied: 1 })).length, 0);
  assert.equal(historyFactors(stats({ approved: 1, denied: 1 }))[0].delta, 0.1);
  const lower = run({ base: base(0.75), rulesScore: 0.05, stats: stats({ approved: 4 }), policy: {}, threshold: 0.7 });
  assert.equal(lower.decision, "allow");
});

test("history never relaxes a critical built-in rule or a require policy", () => {
  const crit = run({ base: base(0.95, "rules"), rulesScore: 0.95, stats: stats({ approved: 9 }), policy: {}, threshold: 0.7 });
  assert.equal(crit.score, 0.95);
  const req = run({ base: base(0.75), rulesScore: 0.05, stats: stats({ approved: 9 }), policy: { require: rule({}) }, threshold: 0.7 });
  assert.equal(req.decision, "hold");
});

test("history cannot push below the built-in rule floor", () => {
  const r = run({ base: base(0.8, "rules"), rulesScore: 0.8, stats: stats({ approved: 9 }), policy: {}, threshold: 0.7 });
  assert.equal(r.score, 0.8);
  assert.equal(r.decision, "hold");
});
