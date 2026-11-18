import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { notFound } from "@/lib/validation";

export const runtime = "nodejs";

/** Delete a comment: its author (still on the board), the board owner, or an admin. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const comment = await prisma.comment.findUnique({
    where: { id: params.id },
    include: { card: { select: { board: { select: { id: true, ownerId: true } } } } },
  });
  if (!comment) return notFound("Commentaire introuvable");

  const board = comment.card.board;
  const isOwner = board.ownerId === auth.user.id;
  const isAuthor = comment.authorId === auth.user.id;
  const stillMember =
    isAuthor &&
    (isOwner ||
      (await prisma.boardMember.findUnique({
        where: { boardId_userId: { boardId: board.id, userId: auth.user.id } },
      })) !== null);
  if (!stillMember && !isOwner && auth.user.globalRole !== "ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  await prisma.comment.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
