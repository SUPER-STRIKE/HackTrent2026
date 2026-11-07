import { db } from "@/lib/db";
import type { AgentStats, PolicyEffect, PolicyMatchOn, PolicyRule } from "@/lib/scoring-core";

export type PolicyRow = PolicyRule & { enabled: boolean; created_by: string | null; created_at: string };

const COLS = "id, name, pattern, match_on, agent_id, effect, reason, enabled, created_by, created_at";

/** Enabled rules that apply to this agent. */
export async function loadPolicies(agentId: string): Promise<PolicyRule[]> {
  const { rows } = await db.query<PolicyRule>(
    `SELECT id, name, pattern, match_on, agent_id, effect, reason
     FROM policy_rules WHERE enabled AND (agent_id IS NULL OR agent_id = $1) ORDER BY created_at`,
    [agentId],
  );
  return rows;
}

export async function listPolicies(): Promise<PolicyRow[]> {
  const { rows } = await db.query<PolicyRow>(`SELECT ${COLS} FROM policy_rules ORDER BY created_at DESC LIMIT 200`);
  return rows;
}

export async function getPolicy(id: string): Promise<PolicyRow | null> {
  const { rows } = await db.query<PolicyRow>(`SELECT ${COLS} FROM policy_rules WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createPolicy(p: {
  name: string;
  pattern: string;
  match_on: PolicyMatchOn;
  agent_id: string | null;
  effect: PolicyEffect;
  reason: string | null;
  created_by: string;
}) {
  await db.query(
    `INSERT INTO policy_rules (name, pattern, match_on, agent_id, effect, reason, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [p.name, p.pattern, p.match_on, p.agent_id, p.effect, p.reason, p.created_by],
  );
}

export async function setPolicyEnabled(id: string, enabled: boolean) {
  await db.query(`UPDATE policy_rules SET enabled = $2 WHERE id = $1`, [id, enabled]);
}

export async function deletePolicy(id: string) {
  await db.query(`DELETE FROM policy_rules WHERE id = $1`, [id]);
}

const LOOKBACK = "30 days";

/** One query: how this agent normally behaves and how humans judged this exact action (type, target and payload) before. */
export async function loadStats(agentId: string, actionType: string, target: string | null, payload: Record<string, unknown>): Promise<AgentStats> {
  const { rows } = await db.query<AgentStats>(
    `SELECT
       count(*)::int                                                              AS total,
       count(*) FILTER (WHERE action_type = $2)::int                              AS type_count,
       count(*) FILTER (WHERE time > now() - interval '1 hour')::int              AS last_hour,
       coalesce(extract(epoch FROM now() - min(time)) / 3600, 0)::float8          AS span_hours,
       count(*) FILTER (WHERE action_type = $2 AND target IS NOT DISTINCT FROM $3
                          AND payload = $4::jsonb AND status = 'approved')::int                           AS approved,
       count(*) FILTER (WHERE action_type = $2 AND target IS NOT DISTINCT FROM $3
                          AND payload = $4::jsonb AND status = 'denied' AND decided_by NOT LIKE 'policy:%')::int AS denied
     FROM agent_events
     WHERE agent_id = $1 AND time > now() - interval '${LOOKBACK}'`,
    [agentId, actionType, target, JSON.stringify(payload)],
  );
  return rows[0];
}
