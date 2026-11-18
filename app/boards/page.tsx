import { AppShell } from "@/components/AppShell";
import { BoardsList } from "./BoardsList";
import { requirePageUser } from "@/lib/auth/page";
import { prisma } from "@/lib/prisma";

export default async function BoardsPage() {
  const user = await requirePageUser({ path: "/boards" });

  const [owned, memberOf] = await Promise.all([
    prisma.board.findMany({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { cards: true } } },
    }),
    prisma.boardMember.findMany({
      where: { userId: user.id, board: { ownerId: { not: user.id } } },
      include: { board: { include: { _count: { select: { cards: true } } } } },
      orderBy: { board: { updatedAt: "desc" } },
    }),
  ]);

  return (
    <AppShell active="boards">
      <BoardsList
        owned={owned.map((b) => ({
          id: b.id,
          name: b.name,
          type: b.type,
          cardsCount: b._count.cards,
          role: "OWNER" as const,
        }))}
        member={memberOf.map((m) => ({
          id: m.board.id,
          name: m.board.name,
          type: m.board.type,
          cardsCount: m.board._count.cards,
          role: m.role,
        }))}
      />
    </AppShell>
  );
}