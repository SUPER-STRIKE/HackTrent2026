import { auth0 } from "@/lib/auth0";
import { canView, isApprover } from "@/lib/approvers";
import { geminiConfigured } from "@/lib/gemini";
import { askInvestigator } from "@/lib/incidents";

const MAX_QUESTION = 2000;
const MAX_HISTORY = 12;

// Viewers spend Gemini quota, so they get a small per-user allowance. Approvers are not limited.
const VIEWER_LIMIT = 15;
const WINDOW_MS = 10 * 60_000;
const viewerCalls = new Map<string, number[]>();
function viewerAllowed(sub: string): boolean {
  const now = Date.now();
  const recent = (viewerCalls.get(sub) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= VIEWER_LIMIT) return false;
  viewerCalls.set(sub, [...recent, now]);
  if (viewerCalls.size > 1000) viewerCalls.clear();
  return true;
}

type Turn = { role: "user" | "model"; text: string };

/** Investigator chat. Body: { question, history?: [{ role: "user" | "model", text }] }. Requires login. */
export async function POST(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (!canView(session.user)) return Response.json({ error: "forbidden" }, { status: 403 });
    if (!isApprover(session.user) && !viewerAllowed(session.user.sub))
      return Response.json({ error: "Viewer limit reached, try again in a few minutes." }, { status: 429 });
    if (!geminiConfigured()) return Response.json({ error: "GEMINI_API_KEY is not set" }, { status: 503 });

    const body = (await request.json().catch(() => null)) as { question?: unknown; history?: unknown } | null;
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question || question.length > MAX_QUESTION) return Response.json({ error: "question must be 1-2000 characters" }, { status: 400 });

    const history: Turn[] = Array.isArray(body?.history)
      ? (body.history as unknown[])
          .filter((t): t is Turn => !!t && typeof t === "object" && ((t as Turn).role === "user" || (t as Turn).role === "model") && typeof (t as Turn).text === "string")
          .slice(-MAX_HISTORY)
          .map((t) => ({ role: t.role, text: t.text.slice(0, MAX_QUESTION * 2) }))
      : [];

    return Response.json({ answer: await askInvestigator(question, history) });
  } catch (err) {
    console.error("investigator failed", err instanceof Error ? err.message : err);
    return Response.json({ error: "The Investigator is unavailable right now." }, { status: 502 });
  }
}
