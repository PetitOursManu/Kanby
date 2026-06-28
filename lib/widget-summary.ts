import { prisma } from "@/lib/prisma";
import { isOverdue, isDueToday } from "@/lib/utils";
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

  const cards = await prisma.card.findMany({
    where: {
      boardId: { in: visibleBoardIds },
      dueDate: { not: null },
      completedAt: null,
    },
    include: { board: { select: { id: true, name: true, type: true } } },
    orderBy: { dueDate: "asc" },
    take: 50,
  });

  const items: WidgetItem[] = cards.map((c) => ({
    id: c.id,
    title: c.title,
    dueDate: (c.dueDate as Date).toISOString(),
    boardId: c.board.id,
    boardName: c.board.name,
    boardType: c.board.type,
  }));

  const dueToday = items.filter((i) => isDueToday(i.dueDate));
  const overdue = items.filter((i) => isOverdue(i.dueDate) && !isDueToday(i.dueDate));
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const upcoming = items
    .filter((i) => {
      const d = new Date(i.dueDate);
      return d > now && d <= weekEnd && !isDueToday(i.dueDate);
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
      totalOpen: items.length,
    },
  };
}