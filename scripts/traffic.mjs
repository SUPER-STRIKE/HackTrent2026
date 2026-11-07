// Steady demo traffic through the real pipeline: one action every INTERVAL seconds (default 5).
//   npm run traffic
// Same env as simulate. About 1 in 6 actions is risky and lands in /approvals as pending (it is
// reported, not waited on, so the stream keeps flowing). Stop with Ctrl+C.
import { Tripwire } from "../sdk/tripwire.mjs";

const env = process.env;
const tw = new Tripwire({
  baseUrl: env.TRIPWIRE_URL || "http://localhost:3000",
  auth0Domain: env.AUTH0_DOMAIN,
  audience: env.AUTH0_AUDIENCE,
  clientId: env.AGENT_CLIENT_ID,
  clientSecret: env.AGENT_CLIENT_SECRET,
  agentName: env.AGENT_NAME || "deploy-bot",
});
const intervalMs = Math.max(1, Number(env.INTERVAL) || 5) * 1000;
const session = `live-${Date.now().toString(36)}`;

const SAFE = [
  ["fs.read", "README.md", {}], ["shell.exec", "npm test", {}], ["db.query", "SELECT count(*) FROM orders", {}],
  ["http.get", "https://api.internal/health", {}], ["fs.write", "src/feature.ts", { bytes: 1840 }],
  ["git.commit", "feat: add retry logic", {}], ["shell.exec", "npm run build", {}], ["fs.read", "docs/runbook.md", {}],
];
const RISKY = [
  ["db.execute", "production", { sql: "DROP TABLE customers" }],
  ["shell.exec", "rm -rf /var/lib/app", {}],
  ["refund", "order-8841", { amount: 4200 }],
  ["fs.read", ".env.production", {}],
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

let n = 0;
async function tick() {
  const [actionType, target, payload] = n++ % 6 === 5 ? pick(RISKY) : pick(SAFE);
  try {
    const r = await tw.report({ sessionId: session, actionType, target, payload });
    console.log(`[${new Date().toLocaleTimeString()}] ${actionType} ${target} -> ${r.status} (risk ${r.risk.score.toFixed(2)})`);
  } catch (e) {
    console.error(`[${new Date().toLocaleTimeString()}] ${e.message}`);
  }
}
console.log(`Sending an action every ${intervalMs / 1000}s to ${tw.baseUrl}. Ctrl+C to stop.`);
await tick();
setInterval(tick, intervalMs);
