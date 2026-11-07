// Demo simulator: a fixed ~3 minute scenario. Same every run.
//   npm run simulate
// Env: TRIPWIRE_URL (default http://localhost:3000), AUTH0_DOMAIN, AUTH0_AUDIENCE,
//      AGENT_CLIENT_ID, AGENT_CLIENT_SECRET. Optional: FAST=1 shortens the pauses.
import { Tripwire, TripwireDenied } from "../sdk/tripwire.mjs";

const env = process.env;
const tw = new Tripwire({
  baseUrl: env.TRIPWIRE_URL || "http://localhost:3000",
  auth0Domain: env.AUTH0_DOMAIN,
  audience: env.AUTH0_AUDIENCE,
  clientId: env.AGENT_CLIENT_ID,
  clientSecret: env.AGENT_CLIENT_SECRET,
  agentName: "deploy-bot",
});

const sleep = (ms) => new Promise((r) => setTimeout(r, env.FAST ? Math.min(ms, 300) : ms));
const session = `demo-${new Date().toISOString().slice(0, 16).replace(/\D/g, "")}`;
const say = (m) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);

// Fixed script: [pause before ms, actionType, target, payload]
const NORMAL = [
  [2000, "fs.read", "README.md", {}],
  [3000, "shell.exec", "npm test", { cwd: "/app" }],
  [3000, "db.query", "SELECT count(*) FROM orders", {}],
  [3000, "http.get", "https://api.internal/health", {}],
  [3000, "fs.write", "src/feature.ts", { bytes: 1840 }],
  [3000, "git.commit", "feat: add retry logic", {}],
  [3000, "shell.exec", "npm run build", { cwd: "/app" }],
];
const RISKY = [30000, "db.execute", "production", { sql: "DROP TABLE customers" }];
const AFTER = [
  [3000, "fs.read", "docs/runbook.md", {}],
  [3000, "shell.exec", "npm run lint", { cwd: "/app" }],
];

async function run(step, label) {
  const [pause, actionType, target, payload] = step;
  await sleep(pause);
  say(`${label} ${actionType} ${target}`);
  try {
    await tw.guard(
      { sessionId: session, actionType, target, payload },
      () => say(`  ran: ${actionType}`),
      {
        onReport: (r) => say(`  risk ${r.risk.score.toFixed(2)} (${r.risk.level}): ${r.risk.reason} -> ${r.status}`),
        onWait: () => say("  waiting for a human to approve with MFA..."),
      },
    );
  } catch (e) {
    if (e instanceof TripwireDenied) say(`  BLOCKED: ${e.message}`);
    else throw e;
  }
}

say(`Tripwire demo, session ${session}`);
for (const s of NORMAL) await run(s, "normal   ");
say("The agent now attempts something dangerous. Approve (or deny) it in /approvals.");
await run(RISKY, "RISKY    ");
for (const s of AFTER) await run(s, "after    ");
say("Done. Now ask the Investigator what happened.");
