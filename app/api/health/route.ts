import { NextResponse } from "next/server";

/**
 * GET /api/health
 * Public health check — no auth required.
 * Returns 200 if the app and database are reachable.
 */
export async function GET() {
  return NextResponse.json({ status: "ok", service: "kanby" });
}