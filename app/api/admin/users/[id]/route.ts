import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { badRequest, notFound } from "@/lib/validation";

export const runtime = "nodejs";

/** Delete a user and everything they own (boards, comments, tokens). */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  if (params.id === auth.user.id) return badRequest("Vous ne pouvez pas supprimer votre propre compte");
  const target = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!target) return notFound("Utilisateur introuvable");

  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
