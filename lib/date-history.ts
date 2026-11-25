/**
 * History of date changes in a calendar: tasks transferred to another day,
 * day / week boards moved, due dates changed. Written next to the change,
 * read by GET /api/boards/:id/history.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/calendar";

type Db = Prisma.TransactionClient | typeof prisma;

export type DateChangeInput = Omit<Prisma.DateChangeUncheckedCreateInput, "id" | "createdAt">;

export async function recordDateChanges(rows: DateChangeInput[], db: Db = prisma) {
  if (rows.length) await db.dateChange.createMany({ data: rows });
}

export type HistoryItem = {
  id: string;
  kind: "CARD_MOVED" | "BOARD_MOVED" | "DUE_DATE";
  period: "DAY" | "WEEK" | null;
  title: string;
  cardId: string | null;
  fromBoardId: string | null;
  toBoardId: string | null;
  /** "YYYY-MM-DD" or null (main board / no due date). */
  from: string | null;
  to: string | null;
  actor: { id: string; displayName: string; avatarUrl: string | null } | null;
  createdAt: string;
};

/**
 * Date changes of a calendar, newest first. `boardId` keeps the changes that
 * involve that day / week board, `cardId` those of one task.
 */
export async function listDateChanges(opts: {
  rootBoardId: string;
  boardId?: string;
  cardId?: string;
  take?: number;
}): Promise<HistoryItem[]> {
  const where: Prisma.DateChangeWhereInput = { rootBoardId: opts.rootBoardId };
  if (opts.cardId) where.cardId = opts.cardId;
  if (opts.boardId) where.OR = [{ fromBoardId: opts.boardId }, { toBoardId: opts.boardId }];
  const rows = await prisma.dateChange.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(opts.take ?? 100, 1), 200),
    include: { actor: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    period: r.period,
    title: r.title,
    cardId: r.cardId,
    fromBoardId: r.fromBoardId,
    toBoardId: r.toBoardId,
    from: r.fromDate ? dayKey(r.fromDate) : null,
    to: r.toDate ? dayKey(r.toDate) : null,
    actor: r.actor,
    createdAt: r.createdAt.toISOString(),
  }));
}
