import { authenticateAgent } from "@/lib/agent-auth";
import { getAgentEventStatus, isUuid } from "@/lib/events";

const MAX_WAIT_SECONDS = 25;
const POLL_INTERVAL_MS = 1000;

/**
 * Agents call this after ingest returns `pending`, to learn whether a human approved
 * or denied the action. `?wait=N` (max 25) long-polls until the status leaves pending.
 * Agents only see their own events.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/actions/[id]">) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) return Response.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    if (!isUuid(id)) return Response.json({ error: "invalid id" }, { status: 400 });

    const wait = Math.min(MAX_WAIT_SECONDS, Math.max(0, Number(new URL(request.url).searchParams.get("wait")) || 0));
    const deadline = Date.now() + wait * 1000;

    let event = await getAgentEventStatus(id, agent.agentId);
    while (event?.status === "pending" && Date.now() < deadline && !request.signal.aborted) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      event = await getAgentEventStatus(id, agent.agentId);
    }
    if (!event) return Response.json({ error: "not found" }, { status: 404 });

    return Response.json({
      event_id: event.id,
      status: event.status,
      // Only approved or allowed actions may run.
      proceed: event.status === "allowed" || event.status === "approved",
      risk: { score: event.risk_score, level: event.risk_level, reason: event.risk_reason },
      decided_at: event.decided_at,
    });
  } catch (err) {
    console.error("action status failed", err);
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}
