import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const comment = await prisma.comment.findUnique({
    where: { id: params.id },
    include: { card: { select: { boardId: true } } },
  });
  if (!comment) return NextResponse.json({ error: "Commentaire introuvable" }, { status: 404 });

  // Author or board owner may delete.
  const board = await prisma.board.findUnique({ where: { id: comment.card.boardId } });
  if (comment.authorId !== auth.user.id && board?.ownerId !== auth.user.id && auth.user.globalRole !== "ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  await prisma.comment.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}