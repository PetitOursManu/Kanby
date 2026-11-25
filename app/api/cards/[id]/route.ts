import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";
import { notifyBoardMembers } from "@/lib/notify";
import { CARD_LIST_INCLUDE } from "@/lib/board-queries";
import { moveCard, compactCards } from "@/lib/ordering";
import { recordDateChanges } from "@/lib/date-history";
import { calendarRootId } from "@/lib/calendar-boards";
import { LIMITS, badRequest, index, notFound, parseDate, readJson, text } from "@/lib/validation";

export const runtime = "nodejs";

async function resolveCard(req: NextRequest, id: string, mode: "read" | "write") {
  const card = await prisma.card.findUnique({ where: { id }, select: { boardId: true, columnId: true, order: true } });
  if (!card) return { error: notFound("Carte introuvable") };
  const auth = await requireBoardMember(req, card.boardId, mode);
  if ("error" in auth) return { error: auth.error };
  return { card, ...auth };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveCard(req, params.id, "read");
  if ("error" in ctx) return ctx.error;

  const card = await prisma.card.findUnique({
    where: { id: params.id },
    include: {
      labels: { include: { label: true } },
      checklist: { orderBy: { order: "asc" } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
      },
      assignee: { select: { id: true, displayName: true, avatarUrl: true } },
      column: { select: { id: true, name: true, kind: true } },
    },
  });
  return NextResponse.json({ card });
}

/**
 * Edit a card. `title`, `description`, `dueDate` change its content;
 * `columnId` and/or `order` move it (same as POST /api/cards/:id/move with
 * `index` = `order`) and keep every position in both columns consistent.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveCard(req, params.id, "write");
  if ("error" in ctx) return ctx.error;

  const body = await readJson<{
    title: string;
    description: string | null;
    dueDate: string | null;
    order: number;
    columnId: string;
  }>(req);
  if (!body) return badRequest("Requête invalide");

  const data: { title?: string; description?: string | null; dueDate?: Date | null } = {};
  const title = text(body.title, LIMITS.cardTitle);
  if (title.error) return badRequest(title.error === "too_long" ? "Titre trop long" : "Titre requis");
  if (title.value) data.title = title.value;

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") return badRequest("Description invalide");
    if (typeof body.description === "string" && body.description.length > LIMITS.description) {
      return badRequest("Description trop longue");
    }
    data.description = body.description?.trim() ? body.description : null;
  }
  if (body.dueDate !== undefined) {
    const d = parseDate(body.dueDate);
    if (d.error) return badRequest("Date invalide");
    data.dueDate = d.value ?? null;
  }

  // Validate a move before writing anything.
  let move: { columnId: string; index: number } | null = null;
  if (body.columnId !== undefined || body.order !== undefined) {
    const columnId = typeof body.columnId === "string" ? body.columnId : ctx.card.columnId;
    const target = await prisma.column.findUnique({ where: { id: columnId }, select: { boardId: true } });
    if (!target || target.boardId !== ctx.card.boardId) return badRequest("Colonne cible invalide");
    move = { columnId, index: index(body.order) ?? Number.MAX_SAFE_INTEGER };
  }

  const before = await prisma.card.findUnique({ where: { id: params.id } });
  if (Object.keys(data).length) await prisma.card.update({ where: { id: params.id }, data });
  let moved = false;
  if (move) moved = (await moveCard(params.id, move.columnId, move.index)).moved;
  await prisma.board.update({ where: { id: ctx.card.boardId }, data: { updatedAt: new Date() } });

  const card = await prisma.card.findUniqueOrThrow({ where: { id: params.id }, include: CARD_LIST_INCLUDE });

  // Only notify when something actually changed.
  // Keep track of due date changes in the date history.
  if (data.dueDate !== undefined && before && data.dueDate?.getTime() !== before.dueDate?.getTime()) {
    await recordDateChanges([
      {
        rootBoardId: calendarRootId(ctx.board),
        kind: "DUE_DATE",
        cardId: params.id,
        fromBoardId: ctx.board.id,
        toBoardId: ctx.board.id,
        title: card.title,
        fromDate: before.dueDate,
        toDate: data.dueDate,
        actorId: ctx.user.id,
      },
    ]);
  }

  const contentChanged =
    (data.title !== undefined && data.title !== before?.title) ||
    (data.description !== undefined && data.description !== before?.description) ||
    (data.dueDate !== undefined && data.dueDate?.getTime() !== before?.dueDate?.getTime());
  if (moved || contentChanged) {
    await notifyBoardMembers({
      req,
      boardId: ctx.card.boardId,
      actorId: ctx.user.id,
      cardId: params.id,
      kind: moved ? "card_moved" : "card_updated",
      messageKey: moved ? "notif.card_moved" : "notif.card_updated",
      vars: { card: card.title },
    });
  }

  return NextResponse.json({ card });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveCard(req, params.id, "write");
  if ("error" in ctx) return ctx.error;
  await prisma.card.delete({ where: { id: params.id } });
  await compactCards(ctx.card.columnId);
  return NextResponse.json({ ok: true });
}
