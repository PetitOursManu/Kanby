import { NextRequest, NextResponse } from "next/server";
import { requireBoardMember } from "@/lib/auth-guard";
import { calendarRootId } from "@/lib/calendar-boards";
import { listDateChanges } from "@/lib/date-history";

export const runtime = "nodejs";

/**
 * GET /api/boards/:id/history[?cardId=…&limit=…] — date changes, newest first.
 * On a main board: its whole calendar. On a day / week board: the changes
 * that involve it. With `cardId`: the changes of that task.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBoardMember(req, params.id, "read");
  if ("error" in auth) return auth.error;

  const sp = req.nextUrl.searchParams;
  const cardId = sp.get("cardId") || undefined;
  const limit = Number(sp.get("limit")) || undefined;
  const items = await listDateChanges({
    rootBoardId: calendarRootId(auth.board),
    boardId: auth.board.parentId && !cardId ? auth.board.id : undefined,
    cardId,
    take: limit,
  });
  return NextResponse.json({ items });
}
