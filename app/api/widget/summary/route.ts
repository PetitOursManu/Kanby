import { NextRequest, NextResponse } from "next/server";
import { resolveWidgetUser } from "@/lib/widget-auth";
import { buildWidgetSummary } from "@/lib/widget-summary";

export const runtime = "nodejs";

/**
 * GET /api/widget/summary
 * Auth: personal API token (Authorization: Bearer kbt_... or ?token=...).
 * Returns a condensed view of the authenticated user's tasks, designed for
 * external dashboards like Dashy. This endpoint is intentionally separate
 * from the session-based API and never touches the login cookie.
 */
export async function GET(req: NextRequest) {
  const user = await resolveWidgetUser(req);
  if (!user) {
    return NextResponse.json({ error: "Token invalide ou manquant" }, { status: 401 });
  }
  const summary = await buildWidgetSummary(user);
  return NextResponse.json(summary);
}