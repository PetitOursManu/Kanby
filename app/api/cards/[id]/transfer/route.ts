import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";
import { getTranslator, parseLocale, LOCALE_COOKIE } from "@/lib/i18n";
import { parseDay } from "@/lib/calendar";
import { transferCards } from "@/lib/card-transfer";
import { CARD_LIST_INCLUDE } from "@/lib/board-queries";
import { badRequest, notFound, readJson } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * POST /api/cards/:id/transfer — `{ date: "YYYY-MM-DD" }`.
 * Moves the task to the board of that day (or week, for a task of a week
 * board) in the same calendar, creating the board if needed.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const card = await prisma.card.findUnique({ where: { id: params.id }, select: { boardId: true } });
  if (!card) return notFound("Carte introuvable");
  const auth = await requireBoardMember(req, card.boardId);
  if ("error" in auth) return auth.error;

  const body = await readJson<{ date: string }>(req);
  if (!body) return badRequest("Requête invalide");
  const date = parseDay(body.date);
  if (!date) return badRequest("Dates invalides (AAAA-MM-JJ)");

  const locale = parseLocale(req.cookies.get(LOCALE_COOKIE)?.value);
  const { target, cards } = await transferCards({ source: auth.board, cardIds: [params.id], date, actorId: auth.user.id, locale, t: getTranslator(locale) });
  if (!cards.length) return badRequest("La tâche est déjà sur ce jour");
  const moved = await prisma.card.findUniqueOrThrow({ where: { id: params.id }, include: CARD_LIST_INCLUDE });
  return NextResponse.json({ card: moved, board: { id: target.id, name: target.name } });
}
