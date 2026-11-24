import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePageUser } from "@/lib/auth/page";
import { isBoardMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { CalendarView } from "@/components/board/CalendarView";
import { getServerTranslator } from "@/lib/i18n/server";
import { addDays, dayKey, monthGrid, parseDay, startOfWeek, today } from "@/lib/calendar";
import { listCalendarBoards } from "@/lib/calendar-boards";

export async function generateMetadata() {
  const t = getServerTranslator();
  return { title: `${t("calendar.title")} — Kanby`, robots: { index: false } };
}

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { view?: string; date?: string };
}) {
  const user = await requirePageUser({ path: `/boards/${params.id}/calendar` });
  const t = getServerTranslator();

  const board = await prisma.board.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, ownerId: true, parentId: true, periodStart: true },
  });
  const member = board ? await isBoardMember(board, user.id) : false;
  if (!board || (!member && user.globalRole !== "ADMIN")) {
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
  // A day / week board has no calendar of its own: show its board's calendar.
  if (board.parentId) {
    redirect(`/boards/${board.parentId}/calendar?date=${board.periodStart ? dayKey(board.periodStart) : ""}`);
  }

  const view = searchParams.view === "week" ? "week" : "month";
  const now = today(process.env.TZ || "Europe/Paris");
  const date = parseDay(searchParams.date) ?? now;

  let from: Date, to: Date;
  if (view === "week") {
    from = startOfWeek(date);
    to = addDays(from, 6);
  } else {
    const grid = monthGrid(date);
    from = grid[0][0];
    to = grid[grid.length - 1][6];
  }
  const entries = await listCalendarBoards(board.id, from, to, view === "week" ? 6 : 0);

  return (
    <AppShell
      active="boards"
      title={t("calendar.title")}
      crumbs={[
        { href: "/boards", label: t("nav.boards") },
        { href: `/boards/${board.id}`, label: board.name },
      ]}
    >
      <CalendarView
        boardId={board.id}
        boardName={board.name}
        view={view}
        date={dayKey(date)}
        today={dayKey(now)}
        entries={entries}
        canEdit={member}
      />
    </AppShell>
  );
}
