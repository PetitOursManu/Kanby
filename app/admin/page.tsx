import { AppShell } from "@/components/AppShell";
import { AdminPanel } from "./AdminPanel";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { appBaseUrl, initiateLoginUri, redirectUri } from "@/lib/kosmy-board/oidc";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.globalRole !== "ADMIN") redirect("/boards");

  const [users, boards, stats, kosmyRow] = await Promise.all([
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
    prisma.kosmyBoardSettings.findUnique({ where: { id: 1 } }),
  ]);

  // Kosmy Board sign-in settings. The client secret is never sent to the browser.
  const h = headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || "http";
  const base = appBaseUrl(`${proto}://${host}`);
  const kosmy = {
    issuer: kosmyRow?.issuer ?? "",
    clientId: kosmyRow?.clientId ?? "",
    autoCreate: kosmyRow?.autoCreate ?? false,
    hasSecret: !!kosmyRow?.clientSecret,
    base,
    redirectUri: redirectUri(base),
    loginUri: initiateLoginUri(base),
  };

  return (
    <AppShell active="admin">
      <AdminPanel users={users} boards={boards} stats={stats} currentUserId={user.id} kosmy={kosmy} />
    </AppShell>
  );
}