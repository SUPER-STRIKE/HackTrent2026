// Seed fixed demo history so the dashboard, incidents and Investigator have something to show.
//   npm run db:seed         seed once
//   npm run demo            seed, then keep adding one event every INTERVAL seconds (default 5). Ctrl+C to stop.
// Idempotent: replaces previous seed rows (session_id starting with "seed-"). Never touches real events.
// (The deployed app can also do this by itself: set DEMO_MODE=1, see .env.example.)
import pg from "pg";
import { pgConfig } from "../db/connection.mjs";
import { historyRows, insertAgents, insertRow, liveRow } from "../db/demo-data.mjs";

try { process.loadEnvFile(".env.local"); } catch {}
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set (.env.local)"); process.exit(1); }

const client = new pg.Client(pgConfig(url));
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("DELETE FROM agent_events WHERE session_id LIKE 'seed-%'");
  await insertAgents(client);
  for (const r of historyRows()) await insertRow(client, r);
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
}

// Make the dashboard aggregates include the seed rows right away (cannot run inside a transaction).
await client.query("CALL refresh_continuous_aggregate('events_per_minute', NULL, NULL)");
await client.query("CALL refresh_continuous_aggregate('events_per_hour', NULL, NULL)");
console.log("Seeded demo history.");

if (!process.argv.includes("--live")) {
  await client.end();
  process.exit(0);
}

const intervalMs = Math.max(1, Number(process.env.INTERVAL || process.env.DEMO_INTERVAL_SECONDS) || 5) * 1000;
let seq = 0;
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
console.log(`Live: adding an event every ${intervalMs / 1000}s. Ctrl+C to stop.`);
while (!stopping) {
  const { rows } = await client.query("SELECT count(*)::int AS n FROM agent_events WHERE session_id = 'seed-live' AND status = 'pending'");
  const r = liveRow(++seq, new Date(), rows[0].n);
  await insertRow(client, r);
  console.log(`[${r.time.toLocaleTimeString()}] ${r.type} ${r.target} -> ${r.status}`);
  await new Promise((res) => setTimeout(res, intervalMs));
}
await client.end();
