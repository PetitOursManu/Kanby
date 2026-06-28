import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { verifyPassword, hashPassword, isPasswordValid } from "@/lib/auth/passwords";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const current = body.currentPassword ?? "";
  const next = body.newPassword ?? "";

  if (!isPasswordValid(next)) {
    return NextResponse.json({ error: "Le nouveau mot de passe doit faire au moins 8 caractères" }, { status: 400 });
  }

  const ok = await verifyPassword(current, auth.user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Mot de passe actuel incorrect" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: auth.user.id },
    data: { passwordHash: await hashPassword(next), mustChangePwd: false },
  });
  return NextResponse.json({ ok: true });
}