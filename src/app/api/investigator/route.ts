import { auth0 } from "@/lib/auth0";
import { geminiConfigured } from "@/lib/gemini";
import { askInvestigator } from "@/lib/incidents";

const MAX_QUESTION = 2000;
const MAX_HISTORY = 12;

type Turn = { role: "user" | "model"; text: string };

/** Investigator chat. Body: { question, history?: [{ role: "user" | "model", text }] }. Requires login. */
export async function POST(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
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
