import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePageUser } from "@/lib/auth/page";
import { getFullBoardForUser } from "@/lib/board-queries";
import { BoardView } from "@/components/board/BoardView";
import { AppShell } from "@/components/AppShell";
import { getServerTranslator } from "@/lib/i18n/server";

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
  return (
    <AppShell active="boards" wide title={board.name} crumbs={[{ href: "/boards", label: t("nav.boards") }]}>
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
      />
    </AppShell>
  );
}
