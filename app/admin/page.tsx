import { AppShell } from "@/components/AppShell";
import { getServerTranslator } from "@/lib/i18n/server";
import { AdminPanel } from "./AdminPanel";
import { requirePageUser } from "@/lib/auth/page";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { appBaseUrl, initiateLoginUri, redirectUri } from "@/lib/kosmy-board/oidc";
import { registrationAllowed, registrationAllowedByEnv } from "@/lib/registration";

export default async function AdminPage() {
  const user = await requirePageUser({ path: "/admin", admin: true });

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

  const settings = { allowRegistration: await registrationAllowed(), envDefault: registrationAllowedByEnv() };

  return (
    <AppShell active="admin" title={getServerTranslator()("admin.title")}>
      <AdminPanel users={users} boards={boards} stats={stats} currentUserId={user.id} kosmy={kosmy} settings={settings} />
    </AppShell>
  );
}