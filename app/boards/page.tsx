import { AppShell } from "@/components/AppShell";
import { BoardsList, type BoardSummary } from "./BoardsList";
import { requirePageUser } from "@/lib/auth/page";
import { prisma } from "@/lib/prisma";
import { getServerTranslator } from "@/lib/i18n/server";

const SELECT = {
  id: true,
  name: true,
  type: true,
  updatedAt: true,
  _count: { select: { cards: true, members: true } },
  cards: { where: { completedAt: { not: null } }, select: { id: true } },
} as const;

export default async function BoardsPage() {
  const user = await requirePageUser({ path: "/boards" });
  const t = getServerTranslator();

  const [owned, memberOf] = await Promise.all([
    prisma.board.findMany({ where: { ownerId: user.id }, orderBy: { updatedAt: "desc" }, select: SELECT }),
    prisma.boardMember.findMany({
      where: { userId: user.id, board: { ownerId: { not: user.id } } },
      select: { role: true, board: { select: { ...SELECT, owner: { select: { displayName: true } } } } },
      orderBy: { board: { updatedAt: "desc" } },
    }),
  ]);

  const toSummary = (b: (typeof owned)[number], role: "OWNER" | "MEMBER", ownerName?: string): BoardSummary => ({
    id: b.id,
    name: b.name,
    type: b.type,
    role,
    cardsCount: b._count.cards,
    doneCount: b.cards.length,
    membersCount: b._count.members,
    updatedAt: b.updatedAt.toISOString(),
    ownerName,
  });

  return (
    <AppShell active="boards" title={t("boards.title")}>
      <BoardsList
        owned={owned.map((b) => toSummary(b, "OWNER"))}
        member={memberOf.map((m) => toSummary(m.board, m.role === "OWNER" ? "OWNER" : "MEMBER", m.board.owner.displayName))}
      />
    </AppShell>
  );
}
