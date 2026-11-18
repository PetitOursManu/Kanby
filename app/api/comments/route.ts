import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";
import { notifyBoardMembers } from "@/lib/notify";
import { LIMITS, badRequest, notFound, readJson, text } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await readJson<{ cardId: string; text: string }>(req);
  if (!body) return badRequest("Requête invalide");
  const t = text(body.text, LIMITS.comment, { required: true });
  if (typeof body.cardId !== "string" || t.error) {
    return badRequest(t.error === "too_long" ? "Commentaire trop long" : "cardId et text requis");
  }

  const card = await prisma.card.findUnique({ where: { id: body.cardId }, select: { boardId: true, title: true } });
  if (!card) return notFound("Carte introuvable");
  const auth = await requireBoardMember(req, card.boardId);
  if ("error" in auth) return auth.error;

  const comment = await prisma.comment.create({
    data: { cardId: body.cardId, authorId: auth.user.id, text: t.value! },
    include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
  });

  await notifyBoardMembers({
    req,
    boardId: card.boardId,
    actorId: auth.user.id,
    cardId: body.cardId,
    kind: "card_commented",
    messageKey: "notif.card_commented",
    vars: { card: card.title },
  });

  return NextResponse.json({ comment }, { status: 201 });
}
