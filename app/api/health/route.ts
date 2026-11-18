import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — public health check (no auth), used by Docker/Coolify.
 * 200 when the app and the database answer, 503 otherwise.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", service: "kanby", database: "ok" });
  } catch {
    return NextResponse.json({ status: "error", service: "kanby", database: "unreachable" }, { status: 503 });
  }
}
