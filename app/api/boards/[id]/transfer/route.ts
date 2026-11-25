import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";
import { getTranslator, parseLocale, LOCALE_COOKIE } from "@/lib/i18n";
import { parseDay } from "@/lib/calendar";
import { transferCards } from "@/lib/card-transfer";
import { badRequest, readJson } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * POST /api/boards/:id/transfer — `{ date: "YYYY-MM-DD", cardIds?: string[] }`.
 * Moves tasks of this board to the board of another day (or week) of the
 * same calendar, creating it if needed. Without `cardIds`: every unfinished
 * task (not in a "Done" column) — e.g. yesterday's leftovers to today.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBoardMember(req, params.id);
  if ("error" in auth) return auth.error;

  const body = await readJson<{ date: string; cardIds: string[] }>(req);
  if (!body) return badRequest("Requête invalide");
  const date = parseDay(body.date);
  if (!date) return badRequest("Dates invalides (AAAA-MM-JJ)");
  if (body.cardIds !== undefined && (!Array.isArray(body.cardIds) || body.cardIds.some((id) => typeof id !== "string") || body.cardIds.length > 500)) {
    return badRequest("cardIds invalide");
  }

  const cardIds =
    body.cardIds ??
    (await prisma.card.findMany({ where: { boardId: params.id, completedAt: null }, select: { id: true } })).map((c) => c.id);

  const locale = parseLocale(req.cookies.get(LOCALE_COOKIE)?.value);
  const { target, cards } = await transferCards({ source: auth.board, cardIds, date, actorId: auth.user.id, locale, t: getTranslator(locale) });
  return NextResponse.json({ board: { id: target.id, name: target.name }, moved: cards.map((c) => c.id) });
}
