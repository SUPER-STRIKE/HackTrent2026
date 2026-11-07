import { authenticateAgent } from "@/lib/agent-auth";
import { db } from "@/lib/db";
import { riskThreshold, scoreAction } from "@/lib/risk";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_PENDING_PER_AGENT = 50;

/** Max actions one agent may report per minute (INGEST_RATE_LIMIT, default 120). */
function rateLimit(): number {
  const n = Number(process.env.INGEST_RATE_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 120;
}

type IngestBody = {
  session_id: string;
  action_type: string;
  target?: string;
  payload?: Record<string, unknown>;
  agent_name?: string;
};

function parseBody(raw: unknown): IngestBody | string {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return "body must be a JSON object";
  const b = raw as Record<string, unknown>;
  if (typeof b.session_id !== "string" || !b.session_id || b.session_id.length > 128)
    return "session_id is required (string, max 128)";
  if (typeof b.action_type !== "string" || !b.action_type || b.action_type.length > 128)
    return "action_type is required (string, max 128)";
  if (b.target !== undefined && (typeof b.target !== "string" || b.target.length > 2048))
    return "target must be a string (max 2048)";
  if (b.payload !== undefined && (typeof b.payload !== "object" || b.payload === null || Array.isArray(b.payload)))
    return "payload must be a JSON object";
  if (b.agent_name !== undefined && (typeof b.agent_name !== "string" || b.agent_name.length > 128))
    return "agent_name must be a string (max 128)";
  return b as unknown as IngestBody;
}

/** Reads the body as text, returning null if it exceeds MAX_BODY_BYTES (counted in bytes). */
async function readLimitedText(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_BODY_BYTES) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Agents POST every action here, before running it. Each action is risk-scored
 * (rules + Gemini). At or above RISK_THRESHOLD it is stored as 'pending' and the
 * agent must wait for a human decision (step 5); otherwise it is 'allowed'.
 */
export async function POST(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) return Response.json({ error: "unauthorized" }, { status: 401 });

    const text = await readLimitedText(request);
    if (text === null) return Response.json({ error: "body too large" }, { status: 413 });

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400 });
    }
    const body = parseBody(raw);
    if (typeof body === "string") return Response.json({ error: body }, { status: 400 });

    // Checked before the Gemini call so a runaway agent cannot burn quota or flood the approvals queue.
    const { rows: usage } = await db.query<{ recent: number; pending: number }>(
      `SELECT count(*) FILTER (WHERE time > now() - interval '1 minute')::int AS recent,
              count(*) FILTER (WHERE status = 'pending')::int AS pending
       FROM agent_events WHERE agent_id = $1 AND time > now() - interval '7 days'`,
      [agent.agentId],
    );
    if (usage[0].recent >= rateLimit() || usage[0].pending >= MAX_PENDING_PER_AGENT)
      return Response.json({ error: "rate limit exceeded" }, { status: 429, headers: { "Retry-After": "30" } });

    const risk = await scoreAction({ ...body, agent_id: agent.agentId });
    const status = risk.score >= riskThreshold() ? "pending" : "allowed";

    // One round trip: register the agent if new and record the event.
    const { rows } = await db.query<{ id: string; time: string; status: string }>(
      `WITH a AS (
         INSERT INTO agents (id, name, auth0_client_id) VALUES ($1, $2, $1)
         ON CONFLICT (id) DO NOTHING
       )
       INSERT INTO agent_events
         (agent_id, session_id, action_type, target, payload, risk_score, risk_level, risk_reason, status)
       VALUES ($1, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, time, status`,
      [
        agent.agentId,
        body.agent_name ?? agent.agentId,
        body.session_id,
        body.action_type,
        body.target ?? null,
        JSON.stringify(body.payload ?? {}),
        risk.score,
        risk.level,
        risk.reason,
        status,
      ],
    );

    return Response.json(
      {
        event_id: rows[0].id,
        time: rows[0].time,
        status: rows[0].status,
        risk: { score: risk.score, level: risk.level, reason: risk.reason, source: risk.source },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("ingest failed", err);
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}
