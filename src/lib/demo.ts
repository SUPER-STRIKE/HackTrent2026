import { db } from "@/lib/db";
import { historyRows, insertAgents, insertRow, liveRow } from "../../db/demo-data.mjs";

/**
 * Built-in demo mode. With DEMO_MODE=1 the app fills itself with demo data, and adds one new
 * event every DEMO_INTERVAL_SECONDS (default 5) while anyone has the dashboard open.
 * Nothing needs to run in a terminal, and it works on Vercel (no background process: each
 * dashboard refresh adds the events that are due). Turn it off by unsetting DEMO_MODE.
 */
export const demoEnabled = () => process.env.DEMO_MODE === "1";

const LOCK_KEY = 7_201_126; // arbitrary, only needs to be unique to this feature
const MAX_CATCH_UP = 12; // after a long gap, do not dump more than this many events at once

export function demoIntervalSeconds(): number {
  const n = Number(process.env.DEMO_INTERVAL_SECONDS);
  // Anything below 1s is clamped to 1s (it used to fall back to 5s, which looked like "no change").
  return Number.isFinite(n) && n > 0 ? Math.max(1, n) : 5;
}

export async function ensureDemoData(): Promise<void> {
  if (!demoEnabled()) return;
  const client = await db.connect();
  let seeded = false;
  try {
    await client.query("BEGIN");
    // One writer at a time. Another request is already doing it, so skip.
    const lock = await client.query("SELECT pg_try_advisory_xact_lock($1) AS ok", [LOCK_KEY]);
    if (!lock.rows[0].ok) {
      await client.query("ROLLBACK");
      return;
    }

    const { rows } = await client.query("SELECT max(time) AS last, count(*)::int AS n FROM agent_events WHERE session_id LIKE 'seed-%'");
    const intervalMs = demoIntervalSeconds() * 1000;
    const now = Date.now();
    await insertAgents(client);

    if (rows[0].n === 0) {
      for (const r of historyRows(now)) await insertRow(client, r);
      seeded = true;
    } else {
      const last = rows[0].last ? new Date(rows[0].last).getTime() : 0;
      const due = Math.min(MAX_CATCH_UP, Math.floor((now - last) / intervalMs));
      if (due > 0) {
        for (let k = due - 1; k >= 0; k--) {
          const time = new Date(now - k * intervalMs);
          await insertRow(client, liveRow(Math.floor(time.getTime() / intervalMs), time));
        }
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("demo data failed", err instanceof Error ? err.message : err);
    return;
  } finally {
    client.release();
  }

  if (seeded) {
    // Historical rows sit behind the aggregate watermark, so refresh (cannot run in a transaction).
    for (const view of ["events_per_minute", "events_per_hour"])
      await db.query(`CALL refresh_continuous_aggregate('${view}', NULL, NULL)`).catch(() => {});
  }
}
