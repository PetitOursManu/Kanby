import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { revokeApiToken } from "@/lib/auth/token";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const ok = await revokeApiToken(auth.user.id, params.id);
  if (!ok) {
    return NextResponse.json({ error: "Token introuvable" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}