import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";
import { CARD_LIST_INCLUDE } from "@/lib/board-queries";
import { LIMITS, badRequest, notFound, readJson, text, parsePriority } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await readJson<{ columnId: string; title: string; priority: number }>(req);
  if (!body) return badRequest("Requête invalide");
  const title = text(body.title, LIMITS.cardTitle, { required: true });
  if (typeof body.columnId !== "string" || title.error) {
    return badRequest(title.error === "too_long" ? "Titre trop long" : "columnId et title requis");
  }

  const column = await prisma.column.findUnique({ where: { id: body.columnId } });
  if (!column) return notFound("Colonne introuvable");

  const auth = await requireBoardMember(req, column.boardId);
  if ("error" in auth) return auth.error;

  const priority = parsePriority(body.priority);
  if (priority.error) return badRequest("Importance invalide (0 à 4)");

  const maxOrder = await prisma.card.aggregate({ where: { columnId: column.id }, _max: { order: true } });
  const order = (maxOrder._max.order ?? -1) + 1;

  const card = await prisma.card.create({
    data: {
      columnId: column.id,
      boardId: column.boardId,
      title: title.value!,
      order,
      priority: priority.value ?? 0,
      completedAt: column.kind === "DONE" ? new Date() : null,
    },
    include: CARD_LIST_INCLUDE,
  });
  await prisma.board.update({ where: { id: column.boardId }, data: { updatedAt: new Date() } });
  return NextResponse.json({ card }, { status: 201 });
}
