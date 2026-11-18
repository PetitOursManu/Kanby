import { getSessionUser } from "@/lib/auth/session";
import { getServerLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { prisma } from "@/lib/prisma";
import { ShellFrame, type NavKey } from "@/components/ShellFrame";

/**
 * Authenticated app layout: sidebar (desktop) / drawer (mobile) + top bar.
 * `title` is the page heading shown in the top bar, `crumbs` the breadcrumb
 * before it. `wide` removes the max width and padding (board page).
 */
export async function AppShell({
  children,
  active,
  wide,
  title,
  crumbs,
}: {
  children: React.ReactNode;
  active?: NavKey;
  wide?: boolean;
  title?: string;
  crumbs?: { href: string; label: string }[];
}) {
  const user = await getSessionUser();
  if (!user) return null;

  const recent = await prisma.board.findMany({
    where: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { id: true, name: true, type: true },
  });

  return (
    <I18nProvider locale={getServerLocale()}>
      <ShellFrame
        user={{ displayName: user.displayName, avatarUrl: user.avatarUrl, isAdmin: user.globalRole === "ADMIN" }}
        recent={recent}
        active={active}
        wide={wide}
        title={title}
        crumbs={crumbs}
      >
        {children}
      </ShellFrame>
    </I18nProvider>
  );
}
