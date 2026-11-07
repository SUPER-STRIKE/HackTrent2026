import { db } from "@/lib/db";
import type { AgentEvent } from "@/lib/events";
import { riskThreshold } from "@/lib/risk";

export type MinuteBucket = { bucket: string; events: number; risky: number; denied: number; pending: number; max_risk: number | null };
export type AgentTotal = { agent_id: string; agent_name: string | null; events: number; risky: number; avg_risk: number | null };
export type ActionTotal = { action_type: string; events: number; avg_risk: number | null };

export type DashboardData = {
  generated_at: string;
  threshold: number;
  totals: { events_1h: number; risky_1h: number; denied_1h: number; pending_now: number; avg_risk_1h: number | null };
  per_minute: MinuteBucket[];
  by_agent: AgentTotal[];
  by_action: ActionTotal[];
  feed: AgentEvent[];
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Reads the continuous aggregates (real-time aggregation on) plus the latest raw events. */
export async function getDashboardData(): Promise<DashboardData> {
  const [minutes, agents, actions, pending, feed] = await Promise.all([
    db.query(
      `SELECT bucket, sum(events)::int AS events, sum(risky)::int AS risky, sum(denied)::int AS denied,
              sum(pending)::int AS pending, max(max_risk) AS max_risk, sum(avg_risk * events) / NULLIF(sum(events), 0) AS avg_risk
       FROM events_per_minute WHERE bucket > now() - interval '60 minutes'
       GROUP BY bucket ORDER BY bucket`,
    ),
    db.query(
      `SELECT m.agent_id, a.name AS agent_name, sum(m.events)::int AS events, sum(m.risky)::int AS risky,
              sum(m.avg_risk * m.events) / NULLIF(sum(m.events), 0) AS avg_risk
       FROM events_per_minute m LEFT JOIN agents a ON a.id = m.agent_id
       WHERE m.bucket > now() - interval '60 minutes'
       GROUP BY m.agent_id, a.name ORDER BY sum(m.events) DESC LIMIT 8`,
    ),
    db.query(
      `SELECT action_type, sum(events)::int AS events, sum(avg_risk * events) / NULLIF(sum(events), 0) AS avg_risk
       FROM events_per_hour WHERE bucket > now() - interval '24 hours'
       GROUP BY action_type ORDER BY sum(events) DESC LIMIT 8`,
    ),
    db.query(`SELECT count(*)::int AS n FROM agent_events WHERE status = 'pending'`),
    db.query<AgentEvent>(
      `SELECT e.id, e.time, e.agent_id, a.name AS agent_name, e.session_id, e.action_type, e.target,
              e.payload, e.risk_score, e.risk_level, e.risk_reason, e.status, e.decided_by, e.decided_at
       FROM agent_events e LEFT JOIN agents a ON a.id = e.agent_id
       ORDER BY e.time DESC LIMIT 25`,
    ),
  ]);

  const per_minute: MinuteBucket[] = minutes.rows.map((r) => ({
    bucket: new Date(r.bucket).toISOString(),
    events: r.events,
    risky: r.risky,
    denied: r.denied,
    pending: r.pending,
    max_risk: num(r.max_risk),
  }));

  const events_1h = per_minute.reduce((s, b) => s + b.events, 0);
  const weighted = minutes.rows.reduce((s, r) => s + (num(r.avg_risk) ?? 0) * r.events, 0);

  return {
    generated_at: new Date().toISOString(),
    threshold: riskThreshold(),
    totals: {
      events_1h,
      risky_1h: per_minute.reduce((s, b) => s + b.risky, 0),
      denied_1h: per_minute.reduce((s, b) => s + b.denied, 0),
      pending_now: pending.rows[0]?.n ?? 0,
      avg_risk_1h: events_1h ? weighted / events_1h : null,
    },
    per_minute,
    by_agent: agents.rows.map((r) => ({ ...r, avg_risk: num(r.avg_risk) })),
    by_action: actions.rows.map((r) => ({ ...r, avg_risk: num(r.avg_risk) })),
    feed: feed.rows,
  };
}
