import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";

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

  const card = await prisma.card.findUnique({ where: { id: cardId }, select: { boardId: true } });
  if (!card) return NextResponse.json({ error: "Carte introuvable" }, { status: 404 });
  const auth = await requireBoardMember(req, card.boardId);
  if ("error" in auth) return auth.error;

  const maxOrder = await prisma.checklistItem.aggregate({
    where: { cardId },
    _max: { order: true },
  });
  const order = (maxOrder._max.order ?? -1) + 1;

  const item = await prisma.checklistItem.create({ data: { cardId, text, order } });
  return NextResponse.json({ item }, { status: 201 });
}