import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { resolveUserFromRequest } from "@/lib/auth/unified";
import { rateLimitOr429 } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/auth/revoke
 * Revoke the API token used to authenticate this request (mobile logout).
 * Auth: Bearer token (the token being revoked).
 *
 * Response 200:  { ok: true }
 * Response 401:  { error: "Non authentifié" }
 */
export async function POST(req: NextRequest) {
  const limited = rateLimitOr429(req, "revoke", 20, 60);
  if (limited) return limited;

  const user = await resolveUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const authHeader = req.headers.get("authorization") || "";
  const rawToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!rawToken) {
    return NextResponse.json({ error: "Token manquant" }, { status: 400 });
  }

  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  await prisma.apiToken.updateMany({
    where: { tokenHash, userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}