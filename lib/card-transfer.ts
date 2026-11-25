/**
 * Transfer tasks to another day (or week) of a calendar — e.g. yesterday's
 * unfinished tasks to today.
 *
 * The cards move with everything they carry (description, checklist,
 * comments, assignee). In the target board they land at the end of the
 * column with the same name (or else the same kind, or else the first
 * column); their labels are matched by name, and created when missing.
 * Every transfer is written to the calendar's date history.
 */
import type { Board, Card, ColumnKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { compactCards } from "@/lib/ordering";
import { openCalendarBoard } from "@/lib/calendar-boards";
import { recordDateChanges } from "@/lib/date-history";
import type { Locale, Translator } from "@/lib/i18n";

type TargetColumn = { id: string; name: string; kind: ColumnKind };

/** Column of `columns` a card coming from `from` should land in. */
export function pickColumn(from: { name: string; kind: ColumnKind }, columns: TargetColumn[]): TargetColumn {
  const name = from.name.trim().toLowerCase();
  const sameName = columns.filter((c) => c.name.trim().toLowerCase() === name);
  return sameName.find((c) => c.kind === from.kind) ?? sameName[0] ?? columns.find((c) => c.kind === from.kind) ?? columns[0];
}

export type TransferResult = { target: Board; cards: Card[] };

/**
 * Move `cardIds` (cards of `source`) to the board of the day / week
 * containing `date` in the same calendar, creating that board if needed.
 * Cards that are not on `source` are ignored.
 */
export async function transferCards(opts: {
  source: Board;
  cardIds: string[];
  date: Date;
  actorId: string;
  locale: Locale;
  t: Translator;
}): Promise<TransferResult> {
  const { source } = opts;
  const root = source.parentId ? await prisma.board.findUniqueOrThrow({ where: { id: source.parentId } }) : source;
  const period = source.period ?? "DAY";
  const { board: target } = await openCalendarBoard({ parent: root, period, date: opts.date, locale: opts.locale, t: opts.t });
  if (target.id === source.id || opts.cardIds.length === 0) return { target, cards: [] };

  const cards = await prisma.card.findMany({
    where: { id: { in: opts.cardIds }, boardId: source.id },
    include: { column: { select: { name: true, kind: true, order: true } }, labels: { include: { label: true } } },
  });
  // Keep the board's reading order: column by column, top to bottom.
  cards.sort((a, b) => a.column.order - b.column.order || a.order - b.order);
  if (!cards.length) return { target, cards: [] };

  const moved = await prisma.$transaction(async (tx) => {
    const columns = await tx.column.findMany({ where: { boardId: target.id }, orderBy: { order: "asc" } });
    if (!columns.length) {
      columns.push(await tx.column.create({ data: { boardId: target.id, name: opts.t("board.defaultColTodo"), kind: "TODO", order: 0 } }));
    }
    const labels = await tx.label.findMany({ where: { boardId: target.id } });
    const next = new Map<string, number>();
    for (const c of columns) {
      const last = await tx.card.findFirst({ where: { columnId: c.id }, orderBy: { order: "desc" }, select: { order: true } });
      next.set(c.id, last ? last.order + 1 : 0);
    }

    const labelFor = async (l: { name: string; color: string }) => {
      const key = l.name.trim().toLowerCase();
      let found = labels.find((x) => x.name.trim().toLowerCase() === key && x.color === l.color) ?? labels.find((x) => x.name.trim().toLowerCase() === key);
      if (!found) {
        found = await tx.label.create({ data: { boardId: target.id, name: l.name, color: l.color } });
        labels.push(found);
      }
      return found.id;
    };

    const out: Card[] = [];
    for (const card of cards) {
      const column = pickColumn(card.column, columns);
      const order = next.get(column.id)!;
      next.set(column.id, order + 1);
      const labelIds = Array.from(new Set(await Promise.all(card.labels.map(({ label }) => labelFor(label)))));
      await tx.cardLabel.deleteMany({ where: { cardId: card.id } });
      if (labelIds.length) await tx.cardLabel.createMany({ data: labelIds.map((labelId) => ({ cardId: card.id, labelId })) });
      out.push(
        await tx.card.update({
          where: { id: card.id },
          data: {
            boardId: target.id,
            columnId: column.id,
            order,
            completedAt: column.kind === "DONE" ? (card.completedAt ?? new Date()) : null,
          },
        }),
      );
    }

    await recordDateChanges(
      cards.map((card) => ({
        rootBoardId: root.id,
        kind: "CARD_MOVED" as const,
        period,
        cardId: card.id,
        fromBoardId: source.id,
        toBoardId: target.id,
        title: card.title,
        fromDate: source.periodStart,
        toDate: target.periodStart,
        actorId: opts.actorId,
      })),
      tx,
    );
    const now = new Date();
    await tx.board.updateMany({ where: { id: { in: [source.id, target.id] } }, data: { updatedAt: now } });
    return out;
  });

  // Close the gaps left in the source columns.
  for (const columnId of new Set(cards.map((c) => c.columnId))) await compactCards(columnId);
  return { target, cards: moved };
}
