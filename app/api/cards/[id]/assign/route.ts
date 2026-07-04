import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";
import { notifyUser } from "@/lib/notify";

export const runtime = "nodejs";

/** Assign a member to a card. Body: { userId } (or null to clear). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const card = await prisma.card.findUnique({ where: { id: params.id }, select: { boardId: true, title: true } });
  if (!card) return NextResponse.json({ error: "Carte introuvable" }, { status: 404 });
  const auth = await requireBoardMember(req, card.boardId);
  if ("error" in auth) return auth.error;

  let body: { userId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const updated = await prisma.card.update({
    where: { id: params.id },
    data: { assigneeId: body.userId || null },
    select: { id: true, assignee: { select: { id: true, displayName: true, avatarUrl: true } } },
  });

  // Notify the newly assigned user.
  if (body.userId && body.userId !== auth.user.id) {
    await notifyUser({
      req,
      userId: body.userId,
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