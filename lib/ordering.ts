import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** Rewrite `order` = 0..n-1 for the given ids, only touching rows that change. */
async function writeOrder(
  tx: Tx,
  model: "card" | "column",
  rows: { id: string; order: number }[],
  ids: string[],
) {
  const current = new Map(rows.map((r) => [r.id, r.order]));
  for (let i = 0; i < ids.length; i++) {
    if (current.get(ids[i]) === i) continue;
    if (model === "card") await tx.card.update({ where: { id: ids[i] }, data: { order: i } });
    else await tx.column.update({ where: { id: ids[i] }, data: { order: i } });
  }
}

/**
 * Move a card to `targetColumnId` at position `targetIndex` (clamped), then
 * re-index the source and target columns so positions stay 0..n-1.
 * Completion is set when the card enters a DONE column, cleared when it
 * leaves one, and kept untouched when it stays in the same kind of column.
 */
export async function moveCard(cardId: string, targetColumnId: string, targetIndex: number) {
  return prisma.$transaction(async (tx) => {
    const card = await tx.card.findUniqueOrThrow({ where: { id: cardId }, include: { column: true } });
    const target = await tx.column.findUniqueOrThrow({ where: { id: targetColumnId } });

    const targetCards = await tx.card.findMany({
      where: { columnId: target.id },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, order: true },
    });
    const ids = targetCards.map((c) => c.id).filter((id) => id !== cardId);
    const idx = Math.min(Math.max(0, targetIndex), ids.length);
    ids.splice(idx, 0, cardId);

    const sameColumn = card.columnId === target.id;
    const wasDone = card.column.kind === "DONE";
    const isDone = target.kind === "DONE";
    const completedAt = isDone ? (wasDone && card.completedAt ? card.completedAt : new Date()) : null;

    if (!sameColumn || completedAt?.getTime() !== card.completedAt?.getTime()) {
      await tx.card.update({ where: { id: cardId }, data: { columnId: target.id, completedAt } });
    }
    await writeOrder(tx, "card", targetCards, ids);

    if (!sameColumn) {
      const sourceCards = await tx.card.findMany({
        where: { columnId: card.columnId },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true, order: true },
      });
      await writeOrder(tx, "card", sourceCards, sourceCards.map((c) => c.id));
    }

    return { card: await tx.card.findUniqueOrThrow({ where: { id: cardId } }), moved: !sameColumn };
  });
}

/** Move a column to `targetIndex` within its board and re-index all columns. */
export async function moveColumn(columnId: string, targetIndex: number) {
  return prisma.$transaction(async (tx) => {
    const column = await tx.column.findUniqueOrThrow({ where: { id: columnId } });
    const cols = await tx.column.findMany({
      where: { boardId: column.boardId },
      orderBy: { order: "asc" },
      select: { id: true, order: true },
    });
    const ids = cols.map((c) => c.id).filter((id) => id !== columnId);
    ids.splice(Math.min(Math.max(0, targetIndex), ids.length), 0, columnId);
    await writeOrder(tx, "column", cols, ids);
  });
}

/** Close gaps after a card deletion. */
export async function compactCards(columnId: string) {
  await prisma.$transaction(async (tx) => {
    const cards = await tx.card.findMany({
      where: { columnId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, order: true },
    });
    await writeOrder(tx, "card", cards, cards.map((c) => c.id));
  });
}

/** Close gaps after a column deletion. */
export async function compactColumns(boardId: string) {
  await prisma.$transaction(async (tx) => {
    const cols = await tx.column.findMany({
      where: { boardId },
      orderBy: { order: "asc" },
      select: { id: true, order: true },
    });
    await writeOrder(tx, "column", cols, cols.map((c) => c.id));
  });
}
