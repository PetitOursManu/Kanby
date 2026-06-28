import { prisma } from "@/lib/prisma";

/** Full board payload with columns, cards, labels, members — for the board page. */
export const FULL_BOARD_INCLUDE = {
  columns: {
    orderBy: { order: "asc" as const },
    include: {
      cards: {
        orderBy: { order: "asc" as const },
        include: {
          labels: { include: { label: true } },
          assignee: { select: { id: true, displayName: true, avatarUrl: true } },
          checklist: { select: { done: true } },
          _count: { select: { checklist: true, comments: true } },
        },
      },
    },
  },
  labels: true,
  members: {
    include: {
      user: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
    },
  },
  owner: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
} as const;

export type FullBoard = Awaited<ReturnType<typeof prisma.board.findUnique>>;

/** Return the full board if the user is a member (or owner/admin viewing). */
export async function getFullBoardForUser(boardId: string, userId: string) {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: FULL_BOARD_INCLUDE,
  });
  if (!board) return null;
  const isOwner = board.ownerId === userId;
  const isMember = isOwner || board.members.some((m) => m.userId === userId);
  return { board, isMember, isOwner };
}