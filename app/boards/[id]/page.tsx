import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePageUser } from "@/lib/auth/page";
import { getFullBoardForUser } from "@/lib/board-queries";
import { BoardView } from "@/components/board/BoardView";
import { AppShell } from "@/components/AppShell";
import { getServerTranslator } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { addDays, dayKey } from "@/lib/calendar";

export async function generateMetadata({ params }: { params: { id: string } }) {
  const t = getServerTranslator();
  return { title: `${t("nav.boards")} — Kanby`, robots: { index: false }, other: { boardId: params.id } };
}

export default async function BoardPage({ params }: { params: { id: string } }) {
  const user = await requirePageUser({ path: `/boards/${params.id}` });
  const t = getServerTranslator();

  const result = await getFullBoardForUser(params.id, user.id);
  if (!result || (!result.isMember && user.globalRole !== "ADMIN")) {
    return (
      <AppShell active="boards" title={t("boards.notFoundTitle")} crumbs={[{ href: "/boards", label: t("nav.boards") }]}>
        <div className="panel flex flex-col items-center justify-center gap-3 p-10 text-center">
          <p className="font-medium text-fg">{t("boards.notFound")}</p>
          <Link href="/boards" className="btn-secondary">
            <ArrowLeft size={15} /> {t("boards.backToList")}
          </Link>
        </div>
      </AppShell>
    );
  }

  const { board, isOwner, isMember } = result;

  // Day / week board of a calendar: link back to its board and calendar.
  const parent = board.parentId ? await prisma.board.findUnique({ where: { id: board.parentId }, select: { id: true, name: true } }) : null;
  const calendar =
    parent && board.period && board.periodStart
      ? { parentId: parent.id, parentName: parent.name, period: board.period, date: dayKey(board.periodStart) }
      : null;
  const childrenCount = parent ? 0 : await prisma.board.count({ where: { parentId: board.id } });

  // The closest earlier day (or week, within a few weeks) that still has
  // unfinished tasks: offered to bring them over (e.g. yesterday → today).
  let leftover: { boardId: string; date: string; count: number } | null = null;
  if (calendar && board.period && board.periodStart) {
    const earlier = await prisma.board.findFirst({
      where: {
        parentId: board.parentId,
        period: board.period,
        periodStart: { lt: board.periodStart, gte: addDays(board.periodStart, board.period === "WEEK" ? -28 : -7) },
      },
      orderBy: { periodStart: "desc" },
      select: { id: true, periodStart: true, _count: { select: { cards: { where: { completedAt: null } } } } },
    });
    if (earlier && earlier._count.cards > 0) {
      leftover = { boardId: earlier.id, date: dayKey(earlier.periodStart!), count: earlier._count.cards };
    }
  }
  const crumbs = [{ href: "/boards", label: t("nav.boards") }];
  if (calendar) {
    crumbs.push(
      { href: `/boards/${calendar.parentId}`, label: calendar.parentName },
      {
        href: `/boards/${calendar.parentId}/calendar?view=${calendar.period === "WEEK" ? "week" : "month"}&date=${calendar.date}`,
        label: t("calendar.title"),
      },
    );
  }

  return (
    <AppShell active="boards" wide title={board.name} crumbs={crumbs}>
      <BoardView
        key={board.id}
        board={board as never}
        currentUser={{
          id: user.id,
          displayName: user.displayName,
          email: user.email,
          avatarUrl: user.avatarUrl,
          globalRole: user.globalRole,
        }}
        isOwner={isOwner}
        canEdit={isMember}
        calendar={calendar}
        calendarCount={childrenCount}
        leftover={leftover}
      />
    </AppShell>
  );
}
