// Seed fixed demo history so the dashboard, incidents and Investigator have something to show.
//   npm run db:seed
// Idempotent: replaces previous seed rows (session_id starting with "seed-"). Never touches real events.
import pg from "pg";
import { pgConfig } from "../db/connection.mjs";

try { process.loadEnvFile(".env.local"); } catch {}
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set (.env.local)"); process.exit(1); }

const AGENTS = [
  ["seed-deploy-bot", "deploy-bot"],
  ["seed-support-bot", "support-bot"],
  ["seed-data-bot", "data-bot"],
];

// [agent, action_type, target, payload, score, reason, status, decided_by]
const SAFE = [
  ["fs.read", "README.md", {}], ["shell.exec", "npm test", {}], ["db.query", "SELECT count(*) FROM orders", {}],
  ["http.get", "https://api.internal/health", {}], ["fs.write", "src/feature.ts", { bytes: 1840 }], ["git.commit", "feat: add retry logic", {}],
];
const INCIDENTS = [
  [0, "db.execute", "production", { sql: "DROP TABLE customers" }, 0.97, "Destructive database statement", "denied", "seed-approver"],
  [0, "shell.exec", "rm -rf /var/lib/app", {}, 0.95, "Destructive filesystem command", "denied", "seed-approver"],
  [1, "send_email", "all-customers@example.com", { subject: "Refund notice", recipients: 12000 }, 0.82, "Mass messaging to customers", "approved", "seed-approver"],
  [2, "fs.read", ".env.production", {}, 0.78, "Accesses secrets or credentials", "denied", "seed-approver"],
  [1, "refund", "order-8841", { amount: 4200 }, 0.8, "Moves money", "approved", "seed-approver"],
  [2, "db.execute", "production", { sql: "DELETE FROM sessions" }, 0.9, "DELETE without WHERE clause", "pending", null],
];

const level = (s) => (s >= 0.9 ? "critical" : s >= 0.7 ? "high" : s >= 0.3 ? "medium" : "low");
const minsAgo = (m) => new Date(Date.now() - m * 60_000);

const client = new pg.Client(pgConfig(url));
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("DELETE FROM agent_events WHERE session_id LIKE 'seed-%'");
  for (const [id, name] of AGENTS)
    await client.query("INSERT INTO agents (id, name, auth0_client_id) VALUES ($1,$2,$1) ON CONFLICT (id) DO NOTHING", [id, name]);

  const insert = (time, agent, type, target, payload, score, reason, status, by) =>
    client.query(
      `INSERT INTO agent_events (time, agent_id, session_id, action_type, target, payload, risk_score, risk_level, risk_reason, status, decided_by, decided_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [time, AGENTS[agent][0], `seed-${AGENTS[agent][1]}`, type, target, JSON.stringify(payload), score, level(score), reason, status, by, by ? new Date(time.getTime() + 60_000) : null],
    );

  // Deterministic background traffic: one safe action per agent every 3 minutes over the last 55 minutes.
  let i = 0;
  for (let m = 55; m >= 2; m -= 3)
    for (let a = 0; a < AGENTS.length; a++) {
      const [type, target, payload] = SAFE[(i++ + a) % SAFE.length];
      await insert(minsAgo(m), a, type, target, payload, 0.05 + ((i * 7) % 20) / 100, "No risky patterns matched", "allowed", null);
    }
  let n = 0;
  for (const [a, type, target, payload, score, reason, status, by] of INCIDENTS)
    await insert(minsAgo(50 - n++ * 8), a, type, target, payload, score, reason, status, by);
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
}

// Make the dashboard aggregates include the seed rows right away (cannot run inside a transaction).
await client.query("CALL refresh_continuous_aggregate('events_per_minute', NULL, NULL)");
await client.query("CALL refresh_continuous_aggregate('events_per_hour', NULL, NULL)");
await client.end();
console.log("Seeded demo history.");
