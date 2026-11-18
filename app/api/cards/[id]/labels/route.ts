import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";
import { badRequest, notFound, readJson } from "@/lib/validation";

export const runtime = "nodejs";

/** Toggle a label (of the same board) on/off on a card. Body: { labelId }. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const card = await prisma.card.findUnique({ where: { id: params.id }, select: { boardId: true } });
  if (!card) return notFound("Carte introuvable");
  const auth = await requireBoardMember(req, card.boardId);
  if ("error" in auth) return auth.error;

  const body = await readJson<{ labelId: string }>(req);
  const labelId = body?.labelId;
  if (typeof labelId !== "string" || !labelId) return badRequest("labelId requis");
  const label = await prisma.label.findUnique({ where: { id: labelId }, select: { boardId: true } });
  if (!label || label.boardId !== card.boardId) return badRequest("Étiquette invalide");

  const key = { cardId_labelId: { cardId: params.id, labelId } };
  const existing = await prisma.cardLabel.findUnique({ where: key });
  if (existing) {
    await prisma.cardLabel.delete({ where: key });
    return NextResponse.json({ attached: false });
  }
  await prisma.cardLabel.create({ data: { cardId: params.id, labelId } });
  return NextResponse.json({ attached: true });
}
