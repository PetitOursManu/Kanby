import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";
import { notifyBoardMembers } from "@/lib/notify";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { cardId?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const cardId = body.cardId;
  const text = body.text?.trim();
  if (!cardId || !text) {
    return NextResponse.json({ error: "cardId et text requis" }, { status: 400 });
  }

  const card = await prisma.card.findUnique({ where: { id: cardId }, select: { boardId: true, title: true } });
  if (!card) return NextResponse.json({ error: "Carte introuvable" }, { status: 404 });
  const auth = await requireBoardMember(req, card.boardId);
  if ("error" in auth) return auth.error;

  const comment = await prisma.comment.create({
    data: { cardId, authorId: auth.user.id, text },
    include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
  });

  // Notify other team board members.
  await notifyBoardMembers({
    req,
    boardId: card.boardId,
    actorId: auth.user.id,
    cardId,
    kind: "card_commented",
    messageKey: "notif.card_commented",
    vars: { card: card.title },
  });

  return NextResponse.json({ comment }, { status: 201 });
}