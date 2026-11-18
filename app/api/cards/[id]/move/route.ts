import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";
import { notifyBoardMembers } from "@/lib/notify";
import { CARD_LIST_INCLUDE } from "@/lib/board-queries";
import { moveCard } from "@/lib/ordering";
import { badRequest, index, notFound, readJson } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * POST /api/cards/:id/move — body { columnId, index }.
 * Moves the card to `index` (0-based, clamped) in `columnId` (same board)
 * and re-indexes both columns in one transaction.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const card = await prisma.card.findUnique({ where: { id: params.id }, select: { boardId: true } });
  if (!card) return notFound("Carte introuvable");
  const auth = await requireBoardMember(req, card.boardId);
  if ("error" in auth) return auth.error;

  const body = await readJson<{ columnId: string; index: number }>(req);
  if (!body || typeof body.columnId !== "string") return badRequest("columnId requis");
  const target = await prisma.column.findUnique({ where: { id: body.columnId }, select: { boardId: true } });
  if (!target || target.boardId !== card.boardId) return badRequest("Colonne cible invalide");

  const { moved } = await moveCard(params.id, body.columnId, index(body.index) ?? Number.MAX_SAFE_INTEGER);
  await prisma.board.update({ where: { id: card.boardId }, data: { updatedAt: new Date() } });
  const updated = await prisma.card.findUniqueOrThrow({ where: { id: params.id }, include: CARD_LIST_INCLUDE });

  if (moved) {
    await notifyBoardMembers({
      req,
      boardId: card.boardId,
      actorId: auth.user.id,
      cardId: params.id,
      kind: "card_moved",
      messageKey: "notif.card_moved",
      vars: { card: updated.title },
    });
  }
  return NextResponse.json({ card: updated });
}
