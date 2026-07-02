import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getFullBoardForUser } from "@/lib/board-queries";
import { BoardView } from "@/components/BoardView";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";

export default async function BoardPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const result = await getFullBoardForUser(params.id, user.id);
  if (!result || (!result.isMember && user.globalRole !== "ADMIN")) {
    return (
      <AppShell active="boards">
        <div className="card-surface flex flex-col items-center justify-center gap-3 p-10 text-center">
          <p className="font-medium text-on-surface">Tableau introuvable ou inaccessible.</p>
          <Link
            href="/boards"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Icon name="chevron_right" size={16} className="rotate-180" />
            Retour aux tableaux
          </Link>
        </div>
      </AppShell>
    );
  }

  const { board, isOwner, isMember } = result;
  const currentUser = {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    globalRole: user.globalRole,
  };

  return (
    <AppShell active="boards" wide>
      <BoardView
        board={board as never}
        currentUser={currentUser}
        isOwner={isOwner}
        canEdit={isMember}
      />
    </AppShell>
  );
}
