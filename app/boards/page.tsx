import { AppShell } from "@/components/AppShell";
import { BoardsList } from "./BoardsList";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function BoardsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [owned, memberOf] = await Promise.all([
    prisma.board.findMany({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { cards: true } } },
    }),
    prisma.boardMember.findMany({
      where: { userId: user.id },
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