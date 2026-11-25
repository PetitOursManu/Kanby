import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";
import { parseDay } from "@/lib/calendar";
import { rescheduleCalendarBoard } from "@/lib/calendar-boards";
import { badRequest, readJson } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Move a day / week board of a calendar to another day / week:
 * `{ date: "YYYY-MM-DD", swap?: boolean }`. Any member of the board can do it.
 * 409 with `conflict` when the target already has a board (unless `swap`).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBoardMember(req, params.id);
  if ("error" in auth) return auth.error;
  if (!auth.board.parentId || !auth.board.period) return badRequest("Ce tableau ne fait pas partie d'un calendrier");

  const body = await readJson<{ date: string; swap: boolean }>(req);
  if (!body) return badRequest("Requête invalide");
  const date = parseDay(body.date);
  if (!date) return badRequest("Dates invalides (AAAA-MM-JJ)");

  const result = await rescheduleCalendarBoard(auth.board, date, body.swap === true, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: "Ce jour a déjà un Kanban", conflict: result.conflict }, { status: 409 });
  }
  await prisma.board.update({ where: { id: auth.board.parentId }, data: { updatedAt: new Date() } });
  return NextResponse.json({ board: result.board, swapped: result.swapped });
}
