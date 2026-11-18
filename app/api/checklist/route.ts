import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";
import { LIMITS, badRequest, notFound, readJson, text } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await readJson<{ cardId: string; text: string }>(req);
  if (!body) return badRequest("Requête invalide");
  const t = text(body.text, LIMITS.checklistText, { required: true });
  if (typeof body.cardId !== "string" || t.error) {
    return badRequest(t.error === "too_long" ? "Texte trop long" : "cardId et text requis");
  }

  const card = await prisma.card.findUnique({ where: { id: body.cardId }, select: { boardId: true } });
  if (!card) return notFound("Carte introuvable");
  const auth = await requireBoardMember(req, card.boardId);
  if ("error" in auth) return auth.error;

  const maxOrder = await prisma.checklistItem.aggregate({ where: { cardId: body.cardId }, _max: { order: true } });
  const order = (maxOrder._max.order ?? -1) + 1;

  const item = await prisma.checklistItem.create({ data: { cardId: body.cardId, text: t.value!, order } });
  return NextResponse.json({ item }, { status: 201 });
}
