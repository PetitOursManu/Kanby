import { prisma } from "@/lib/prisma";
import { dueState } from "@/lib/format";
import type { User } from "@prisma/client";

export type WidgetItem = {
  id: string;
  title: string;
  dueDate: string;
  boardId: string;
  boardName: string;
  boardType: "PERSONAL" | "TEAM";
};

export type WidgetSummary = {
  dueToday: WidgetItem[];
  overdue: WidgetItem[];
  upcoming: WidgetItem[];
  counts: { dueToday: number; overdue: number; upcoming: number; totalOpen: number };
};

/** Build the widget summary for a given user. Shared by the API route and the view page. */
export async function buildWidgetSummary(user: User): Promise<WidgetSummary> {
  const [ownedBoards, memberBoards] = await Promise.all([
    prisma.board.findMany({ where: { ownerId: user.id }, select: { id: true } }),
    prisma.boardMember.findMany({ where: { userId: user.id }, select: { boardId: true } }),
  ]);
  const visibleBoardIds = [
    ...ownedBoards.map((b) => b.id),
    ...memberBoards.map((m) => m.boardId),
  ];

  if (visibleBoardIds.length === 0) {
    return { dueToday: [], overdue: [], upcoming: [], counts: { dueToday: 0, overdue: 0, upcoming: 0, totalOpen: 0 } };
  }

  const openWhere = { boardId: { in: visibleBoardIds }, completedAt: null };
  const [cards, totalOpen] = await Promise.all([
    prisma.card.findMany({
      where: { ...openWhere, dueDate: { not: null } },
      include: { board: { select: { id: true, name: true, type: true } } },
      orderBy: { dueDate: "asc" },
      take: 200,
    }),
    prisma.card.count({ where: openWhere }),
  ]);

  const items: WidgetItem[] = cards.map((c) => ({
    id: c.id,
    title: c.title,
    dueDate: (c.dueDate as Date).toISOString(),
    boardId: c.board.id,
    boardName: c.board.name,
    boardType: c.board.type,
  }));

  // Due dates are calendar days (see lib/format): compare days, not instants.
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndKey = weekEnd.toISOString().slice(0, 10);
  const dueToday = items.filter((i) => dueState(i.dueDate, now) === "today");
  const overdue = items.filter((i) => dueState(i.dueDate, now) === "overdue");
  const upcoming = items
    .filter((i) => {
      const st = dueState(i.dueDate, now);
      return (st === "soon" || st === "later") && i.dueDate.slice(0, 10) <= weekEndKey;
    })
    .slice(0, 5);

  return {
    dueToday,
    overdue,
    upcoming,
    counts: {
      dueToday: dueToday.length,
      overdue: overdue.length,
      upcoming: upcoming.length,
      totalOpen,
    },
  };
}