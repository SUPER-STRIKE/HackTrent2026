import { db } from "@/lib/db";

export type EventStatus = "allowed" | "pending" | "approved" | "denied";

export type AgentEvent = {
  id: string;
  time: string;
  agent_id: string;
  agent_name: string | null;
  session_id: string;
  action_type: string;
  target: string | null;
  payload: Record<string, unknown>;
  risk_score: number | null;
  risk_level: string | null;
  risk_reason: string | null;
  status: EventStatus;
  decided_by: string | null;
  decided_at: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID_RE.test(s);

const SELECT = `
  SELECT e.id, e.time, e.agent_id, a.name AS agent_name, e.session_id, e.action_type, e.target,
         e.payload, e.risk_score, e.risk_level, e.risk_reason, e.status, e.decided_by, e.decided_at
  FROM agent_events e LEFT JOIN agents a ON a.id = e.agent_id`;

export async function listPending(limit = 50): Promise<AgentEvent[]> {
  const { rows } = await db.query<AgentEvent>(`${SELECT} WHERE e.status = 'pending' ORDER BY e.time DESC LIMIT $1`, [limit]);
  return rows;
}

export async function listRecentDecisions(limit = 20): Promise<AgentEvent[]> {
  const { rows } = await db.query<AgentEvent>(
    `${SELECT} WHERE e.status IN ('approved','denied') AND e.decided_at > now() - interval '7 days'
     ORDER BY e.decided_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

/** Status of one event, scoped to the agent that reported it. */
export async function getAgentEventStatus(id: string, agentId: string) {
  const { rows } = await db.query<Pick<AgentEvent, "id" | "status" | "risk_score" | "risk_level" | "risk_reason" | "decided_at">>(
    `SELECT id, status, risk_score, risk_level, risk_reason, decided_at
     FROM agent_events WHERE id = $1 AND agent_id = $2 LIMIT 1`,
    [id, agentId],
  );
  return rows[0] ?? null;
}

/**
 * Atomically moves a pending event to approved or denied.
 * Returns false if it does not exist or was already decided.
 */
export async function decideEvent(id: string, decision: "approved" | "denied", decidedBy: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE agent_events SET status = $2, decided_by = $3, decided_at = now()
     WHERE id = $1 AND status = 'pending'`,
    [id, decision, decidedBy],
  );
  return rowCount === 1;
}
