import { auth0 } from "@/lib/auth0";
import { isApprover } from "@/lib/approvers";
import { getDashboardData } from "@/lib/dashboard";

/** Live dashboard data. Requires a logged-in user. */
export async function GET() {
  try {
    const session = await auth0.getSession();
    if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (!isApprover(session.user)) return Response.json({ error: "forbidden" }, { status: 403 });
    return Response.json(await getDashboardData(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("dashboard failed", err);
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}
