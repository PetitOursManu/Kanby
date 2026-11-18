import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember, isBoardMember } from "@/lib/auth-guard";
import { notifyUser } from "@/lib/notify";
import { badRequest, notFound, readJson } from "@/lib/validation";

export const runtime = "nodejs";

/** Assign a board member to a card. Body: { userId } (or null to clear). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const card = await prisma.card.findUnique({
    where: { id: params.id },
    select: { boardId: true, title: true, assigneeId: true },
  });
  if (!card) return notFound("Carte introuvable");
  const auth = await requireBoardMember(req, card.boardId);
  if ("error" in auth) return auth.error;

  const body = await readJson<{ userId: string | null }>(req);
  if (!body) return badRequest("Requête invalide");
  const userId = body.userId || null;
  if (userId !== null) {
    if (typeof userId !== "string") return badRequest("userId invalide");
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { active: true } });
    if (!target || !target.active || !(await isBoardMember(auth.board, userId))) {
      return badRequest("Cet utilisateur n'est pas membre du tableau");
    }
  }

  const updated = await prisma.card.update({
    where: { id: params.id },
    data: { assigneeId: userId },
    select: { id: true, assignee: { select: { id: true, displayName: true, avatarUrl: true } } },
  });

  if (userId && userId !== card.assigneeId && userId !== auth.user.id) {
    await notifyUser({
      req,
      userId,
      actorId: auth.user.id,
      boardId: card.boardId,
      cardId: params.id,
      kind: "card_assigned",
      messageKey: "notif.card_assigned",
      vars: { card: card.title },
    });
  }

  return NextResponse.json({ card: updated });
}
