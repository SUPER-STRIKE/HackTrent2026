// Shared demo data: used by scripts/seed.mjs and by the app's built-in demo mode (src/lib/demo.ts).
// Demo rows all have a session_id starting with "seed-", so they are easy to tell apart and to replace.

export const AGENTS = [
  ["seed-deploy-bot", "deploy-bot"],
  ["seed-support-bot", "support-bot"],
  ["seed-data-bot", "data-bot"],
];

export const SAFE = [
  ["fs.read", "README.md", {}], ["shell.exec", "npm test", {}], ["db.query", "SELECT count(*) FROM orders", {}],
  ["http.get", "https://api.internal/health", {}], ["fs.write", "src/feature.ts", { bytes: 1840 }], ["git.commit", "feat: add retry logic", {}],
];

// [agent index, action_type, target, payload, score, reason, status, decided_by]
export const INCIDENTS = [
  [0, "db.execute", "production", { sql: "DROP TABLE customers" }, 0.97, "Destructive database statement", "denied", "seed-approver"],
  [0, "shell.exec", "rm -rf /var/lib/app", {}, 0.95, "Destructive filesystem command", "denied", "seed-approver"],
  [1, "send_email", "all-customers@example.com", { subject: "Refund notice", recipients: 12000 }, 0.82, "Mass messaging to customers", "approved", "seed-approver"],
  [2, "fs.read", ".env.production", {}, 0.78, "Accesses secrets or credentials", "denied", "seed-approver"],
  [1, "refund", "order-8841", { amount: 4200 }, 0.8, "Moves money", "approved", "seed-approver"],
  [2, "db.execute", "production", { sql: "DELETE FROM sessions" }, 0.9, "DELETE without WHERE clause", "pending", null],
];

export const level = (s) => (s >= 0.9 ? "critical" : s >= 0.7 ? "high" : s >= 0.3 ? "medium" : "low");

const rnd = (n) => Math.floor(Math.random() * n);

/** A row is { time, agent, session, type, target, payload, score, reason, status, by }. */
const row = (time, agent, session, type, target, payload, score, reason, status, by) => ({ time, agent, session, type, target, payload, score, reason, status, by });

/** Deterministic background history plus the incidents, ending a few minutes before `now`. */
export function historyRows(now = Date.now()) {
  const rows = [];
  const at = (m) => new Date(now - m * 60_000);
  let i = 0;
  for (let m = 55; m >= 2; m -= 3)
    for (let a = 0; a < AGENTS.length; a++) {
      const [type, target, payload] = SAFE[(i++ + a) % SAFE.length];
      rows.push(row(at(m), a, `seed-${AGENTS[a][1]}`, type, target, payload, 0.05 + ((i * 7) % 20) / 100, "No risky patterns matched", "allowed", null));
    }
  INCIDENTS.forEach(([a, type, target, payload, score, reason, status, by], n) =>
    rows.push(row(at(50 - n * 8), a, `seed-${AGENTS[a][1]}`, type, target, payload, score, reason, status, by)),
  );
  return rows;
}

/**
 * One live event. Every 7th is risky (by `seq`), and is left pending while fewer than 3 live
 * rows are pending, otherwise it is shown as denied by the demo policy.
 */
export function liveRow(seq, time, pendingNow) {
  const a = rnd(AGENTS.length);
  if (seq % 7 === 0) {
    const [, type, target, payload, score, reason] = INCIDENTS[rnd(INCIDENTS.length)];
    const pending = pendingNow < 3;
    return row(time, a, "seed-live", type, target, payload, score, reason, pending ? "pending" : "denied", pending ? null : "demo-policy");
  }
  const [type, target, payload] = SAFE[rnd(SAFE.length)];
  return row(time, a, "seed-live", type, target, payload, 0.03 + rnd(25) / 100, "No risky patterns matched", "allowed", null);
}

export async function insertAgents(client) {
  for (const [id, name] of AGENTS)
    await client.query("INSERT INTO agents (id, name, auth0_client_id) VALUES ($1,$2,$1) ON CONFLICT (id) DO NOTHING", [id, name]);
}

export async function insertRow(client, r) {
  await client.query(
    `INSERT INTO agent_events (time, agent_id, session_id, action_type, target, payload, risk_score, risk_level, risk_reason, status, decided_by, decided_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [r.time, AGENTS[r.agent][0], r.session, r.type, r.target, JSON.stringify(r.payload), r.score, level(r.score), r.reason, r.status, r.by, r.by ? new Date(r.time.getTime() + 60_000) : null],
  );
}
