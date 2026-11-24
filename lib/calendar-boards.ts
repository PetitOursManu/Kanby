/**
 * Calendar boards (server side).
 *
 * A board can hold one child board per day and per week. A child board:
 *  - is named automatically ("Elisa30 — Lundi 24 novembre 2026"),
 *  - starts with a copy of the parent's columns and labels (no cards),
 *  - has the parent's owner, type and members — membership and type are
 *    managed on the parent and kept in sync on every child,
 *  - is deleted with its parent.
 */
import { Prisma, type Board } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LIMITS } from "@/lib/validation";
import { dayKey, movedBoardName, periodBoardName, periodStart, type Period } from "@/lib/calendar";
import { getTranslator, LOCALES, type Locale, type Translator } from "@/lib/i18n";

/** The board whose calendar `board` belongs to (itself for a regular board). */
export const calendarRootId = (board: Pick<Board, "id" | "parentId">) => board.parentId ?? board.id;

/** Ids of a regular board and of every board of its calendar. */
export async function calendarFamilyIds(rootId: string): Promise<string[]> {
  const children = await prisma.board.findMany({ where: { parentId: rootId }, select: { id: true } });
  return [rootId, ...children.map((c) => c.id)];
}

function nameFor(parentName: string, period: Period, start: Date, locale: Locale, t: Translator) {
  const weekLabel = (week: number) => t("calendar.weekN", { week });
  const full = periodBoardName(parentName, period, start, locale, weekLabel);
  if (full.length <= LIMITS.boardName) return full;
  // Keep the date readable: shorten the parent name instead.
  const suffix = full.slice(parentName.length);
  return `${parentName.slice(0, Math.max(1, LIMITS.boardName - suffix.length - 1))}…${suffix}`;
}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * Return the board of `parent`'s calendar for the period containing `date`,
 * creating it when it does not exist yet.
 */
export async function openCalendarBoard(opts: {
  parent: Board;
  period: Period;
  date: Date;
  locale: Locale;
  t: Translator;
}): Promise<{ board: Board; created: boolean }> {
  const { parent, period } = opts;
  const start = periodStart(period, opts.date);
  const where = { parentId_period_periodStart: { parentId: parent.id, period, periodStart: start } };

  const existing = await prisma.board.findUnique({ where });
  if (existing) return { board: existing, created: false };

  const [columns, labels, members] = await Promise.all([
    prisma.column.findMany({ where: { boardId: parent.id }, orderBy: { order: "asc" }, select: { name: true, kind: true, color: true } }),
    prisma.label.findMany({ where: { boardId: parent.id }, select: { name: true, color: true } }),
    prisma.boardMember.findMany({ where: { boardId: parent.id }, select: { userId: true, role: true } }),
  ]);
  const t = opts.t;
  const cols = columns.length
    ? columns
    : [
        { name: t("board.defaultColTodo"), kind: "TODO" as const, color: null },
        { name: t("board.defaultColDoing"), kind: "DOING" as const, color: null },
        { name: t("board.defaultColDone"), kind: "DONE" as const, color: null },
      ];

  try {
    const board = await prisma.board.create({
      data: {
        name: nameFor(parent.name, period, start, opts.locale, t),
        type: parent.type,
        ownerId: parent.ownerId,
        parentId: parent.id,
        period,
        periodStart: start,
        columns: { create: cols.map((c, order) => ({ ...c, order })) },
        labels: labels.length ? { create: labels } : undefined,
        members: members.length ? { create: members } : undefined,
      },
    });
    return { board, created: true };
  } catch (e) {
    // Two clicks at once: the other request created it first.
    if (isUniqueViolation(e)) {
      const board = await prisma.board.findUnique({ where });
      if (board) return { board, created: false };
    }
    throw e;
  }
}

export type CalendarEntry = {
  id: string;
  name: string;
  period: Period;
  /** "YYYY-MM-DD": the day, or the Monday of the week. */
  date: string;
  cardsCount: number;
  doneCount: number;
  /** First cards of the board (by column, then position), for the week view. */
  cards: { id: string; title: string; done: boolean }[];
};

/** Calendar boards of `parentId` whose period starts between `from` and `to` (inclusive). */
export async function listCalendarBoards(parentId: string, from: Date, to: Date, previewCards = 0): Promise<CalendarEntry[]> {
  const rows = await prisma.board.findMany({
    where: { parentId, periodStart: { gte: from, lte: to } },
    orderBy: { periodStart: "asc" },
    select: {
      id: true,
      name: true,
      period: true,
      periodStart: true,
      _count: { select: { cards: true } },
      cards: {
        select: { id: true, title: true, completedAt: true },
        orderBy: [{ column: { order: "asc" } }, { order: "asc" }],
      },
    },
  });
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    period: b.period as Period,
    date: dayKey(b.periodStart!),
    cardsCount: b._count.cards,
    doneCount: b.cards.filter((c) => c.completedAt).length,
    cards: b.cards.slice(0, previewCards).map((c) => ({ id: c.id, title: c.title, done: c.completedAt !== null })),
  }));
}

const weekLabels = Object.fromEntries(
  LOCALES.map((l) => [l, (week: number) => getTranslator(l)("calendar.weekN", { week })]),
) as Record<Locale, (week: number) => string>;

export type RescheduleResult =
  | { ok: true; board: Board; swapped: Board | null }
  | { ok: false; conflict: Pick<Board, "id" | "name"> };

/**
 * Move a day / week board to the period containing `date` (any day of the
 * week for a week board). The date in its automatic name follows.
 *
 * When that period already has a board: with `swap`, the two boards trade
 * places; without it, nothing changes and the other board is returned as
 * `conflict`.
 */
export async function rescheduleCalendarBoard(board: Board, date: Date, swap: boolean): Promise<RescheduleResult> {
  if (!board.parentId || !board.period || !board.periodStart) throw new Error("not a calendar board");
  const period = board.period;
  const from = board.periodStart;
  const to = periodStart(period, date);
  if (to.getTime() === from.getTime()) return { ok: true, board, swapped: null };

  const other = await prisma.board.findUnique({
    where: { parentId_period_periodStart: { parentId: board.parentId, period, periodStart: to } },
  });
  if (other && !swap) return { ok: false, conflict: { id: other.id, name: other.name } };

  const rename = (b: Board, a: Date, z: Date) => movedBoardName(b.name, period, a, z, weekLabels);
  try {
    return await prisma.$transaction(async (tx) => {
      // Free the target day first: (parent, period, day) is unique.
      if (other) await tx.board.update({ where: { id: other.id }, data: { periodStart: null } });
      const moved = await tx.board.update({ where: { id: board.id }, data: { periodStart: to, name: rename(board, from, to) } });
      const swapped = other
        ? await tx.board.update({ where: { id: other.id }, data: { periodStart: from, name: rename(other, to, from) } })
        : null;
      return { ok: true as const, board: moved, swapped };
    });
  } catch (e) {
    // Someone created a board on that day at the same moment.
    if (isUniqueViolation(e)) {
      const taken = await prisma.board.findUnique({
        where: { parentId_period_periodStart: { parentId: board.parentId, period, periodStart: to } },
        select: { id: true, name: true },
      });
      if (taken) return { ok: false, conflict: taken };
    }
    throw e;
  }
}
