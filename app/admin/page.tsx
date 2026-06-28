import { AppShell } from "@/components/AppShell";
import { AdminPanel } from "./AdminPanel";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.globalRole !== "ADMIN") redirect("/boards");

  const [users, boards, stats] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, email: true, displayName: true, avatarUrl: true,
        globalRole: true, active: true, createdAt: true,
        _count: { select: { ownedBoards: true } },
      },
    }),
    prisma.board.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        owner: { select: { id: true, displayName: true, email: true } },
        _count: { select: { cards: true, members: true } },
      },
    }),
    Promise.all([
      prisma.user.count(),
      prisma.board.count(),
      prisma.card.count({ where: { completedAt: null } }),
      prisma.card.count({ where: { completedAt: { not: null } } }),
    ]).then(([u, b, a, c]) => ({ users: u, boards: b, activeTasks: a, completedTasks: c })),
  ]);

  return (
    <AppShell active="admin">
      <AdminPanel users={users} boards={boards} stats={stats} currentUserId={user.id} />
    </AppShell>
  );
}