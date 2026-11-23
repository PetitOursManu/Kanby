import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { createApiToken } from "@/lib/auth/token";
import { LIMITS, badRequest, readJson } from "@/lib/validation";
import { mayUseApi } from "@/lib/restrictions";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const tokens = await prisma.apiToken.findMany({
    where: { userId: auth.user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, prefix: true, lastUsedAt: true, createdAt: true },
  });
  return NextResponse.json({ tokens });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  if (!mayUseApi(auth.user)) return NextResponse.json({ error: "L'accès à l'API est désactivé pour votre compte" }, { status: 403 });

  const body = (await readJson<{ label: string }>(req)) ?? {};
  const label = (typeof body.label === "string" ? body.label.trim() : "").slice(0, LIMITS.tokenLabel) || "Sans nom";
  if (body.label !== undefined && typeof body.label !== "string") return badRequest("Nom invalide");

  const { raw, token } = await createApiToken(auth.user.id, label);
  // The raw token is returned ONCE; only its hash and prefix are stored.
  return NextResponse.json({ raw, token }, { status: 201 });
}
