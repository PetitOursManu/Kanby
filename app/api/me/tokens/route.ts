import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { createApiToken } from "@/lib/auth/token";

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

  let body: { label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const label = body.label?.trim() || "Sans nom";

  const { raw, token } = await createApiToken(auth.user.id, label);
  // The raw token is returned ONCE; only the prefix is stored/persisted.
  return NextResponse.json({ raw, token }, { status: 201 });
}