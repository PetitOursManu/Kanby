import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";

export const runtime = "nodejs";

/** Toggle a label on/off on a card. Body: { labelId }. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const card = await prisma.card.findUnique({ where: { id: params.id }, select: { boardId: true } });
  if (!card) return NextResponse.json({ error: "Carte introuvable" }, { status: 404 });
  const auth = await requireBoardMember(req, card.boardId);
  if ("error" in auth) return auth.error;

  let body: { labelId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const labelId = body.labelId;
  if (!labelId) return NextResponse.json({ error: "labelId requis" }, { status: 400 });

  const existing = await prisma.cardLabel.findUnique({
    where: { cardId_labelId: { cardId: params.id, labelId } },
  });
  if (existing) {
    await prisma.cardLabel.delete({ where: { cardId_labelId: { cardId: params.id, labelId } } });
    return NextResponse.json({ attached: false });
  }
  await prisma.cardLabel.create({ data: { cardId: params.id, labelId } });
  return NextResponse.json({ attached: true });
}