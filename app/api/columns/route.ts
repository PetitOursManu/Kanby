import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";
import { notifyBoardMembers } from "@/lib/notify";
import { CARD_LIST_INCLUDE } from "@/lib/board-queries";
import { HEX_COLOR_RE, LIMITS, badRequest, readJson, text } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await readJson<{ boardId: string; name: string; kind: "TODO" | "DOING" | "DONE"; color: string | null }>(req);
  if (!body) return badRequest("Requête invalide");
  const name = text(body.name, LIMITS.columnName, { required: true });
  if (typeof body.boardId !== "string" || name.error) {
    return badRequest(name.error === "too_long" ? "Nom trop long" : "boardId et name requis");
  }
  if (body.color && (typeof body.color !== "string" || !HEX_COLOR_RE.test(body.color))) {
    return badRequest("Couleur invalide");
  }

  const auth = await requireBoardMember(req, body.boardId);
  if ("error" in auth) return auth.error;

  const maxOrder = await prisma.column.aggregate({ where: { boardId: body.boardId }, _max: { order: true } });
  const order = (maxOrder._max.order ?? -1) + 1;
  const kind = body.kind === "DOING" ? "DOING" : body.kind === "DONE" ? "DONE" : "TODO";

  const column = await prisma.column.create({
    data: { boardId: body.boardId, name: name.value!, kind, order, color: body.color || null },
    include: { cards: { orderBy: { order: "asc" }, include: CARD_LIST_INCLUDE } },
  });

  await notifyBoardMembers({
    req,
    boardId: body.boardId,
    actorId: auth.user.id,
    kind: "column_added",
    messageKey: "notif.column_added",
  });

  return NextResponse.json({ column }, { status: 201 });
}
