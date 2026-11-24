import { NextRequest, NextResponse } from "next/server";
import { requireBoardMember } from "@/lib/auth-guard";
import { getTranslator, parseLocale, LOCALE_COOKIE } from "@/lib/i18n";
import { addDays, addMonths, monthGrid, parseDay, today } from "@/lib/calendar";
import { listCalendarBoards, openCalendarBoard } from "@/lib/calendar-boards";
import { badRequest, readJson } from "@/lib/validation";

export const runtime = "nodejs";

const MAX_RANGE_DAYS = 400;

/**
 * Boards of this board's calendar between `from` and `to` (YYYY-MM-DD,
 * inclusive). Defaults to the weeks of the current month.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBoardMember(req, params.id, "read");
  if ("error" in auth) return auth.error;
  if (auth.board.parentId) return badRequest("Ce tableau fait déjà partie d'un calendrier");

  const sp = req.nextUrl.searchParams;
  const grid = monthGrid(today());
  const from = sp.has("from") ? parseDay(sp.get("from")) : grid[0][0];
  const to = sp.has("to") ? parseDay(sp.get("to")) : grid[grid.length - 1][6];
  if (!from || !to || to < from) return badRequest("Dates invalides (AAAA-MM-JJ)");
  if (to > addDays(from, MAX_RANGE_DAYS) || to > addMonths(from, 14)) return badRequest("Période trop longue");

  const boards = await listCalendarBoards(params.id, from, to);
  return NextResponse.json({ boards: boards.map(({ cards: _cards, ...b }) => b) });
}

/**
 * Open the board of a day or a week (`{ period: "DAY" | "WEEK", date: "YYYY-MM-DD" }`),
 * creating it with an automatic name when it does not exist yet.
 * 201 when created, 200 when it already existed.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBoardMember(req, params.id);
  if ("error" in auth) return auth.error;
  if (auth.board.parentId) return badRequest("Ce tableau fait déjà partie d'un calendrier");

  const body = await readJson<{ period: string; date: string }>(req);
  if (!body) return badRequest("Requête invalide");
  if (body.period !== "DAY" && body.period !== "WEEK") return badRequest("Période invalide (DAY ou WEEK)");
  const date = parseDay(body.date);
  if (!date) return badRequest("Dates invalides (AAAA-MM-JJ)");

  const locale = parseLocale(req.cookies.get(LOCALE_COOKIE)?.value);
  const { board, created } = await openCalendarBoard({ parent: auth.board, period: body.period, date, locale, t: getTranslator(locale) });
  return NextResponse.json({ board, created }, { status: created ? 201 : 200 });
}
