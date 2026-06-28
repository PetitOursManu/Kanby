import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getFullBoardForUser } from "@/lib/board-queries";
import { BoardView } from "@/components/BoardView";
import { AppShell } from "@/components/AppShell";

export default async function BoardPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const result = await getFullBoardForUser(params.id, user.id);
  if (!result || (!result.isMember && user.globalRole !== "ADMIN")) {
    return (
      <AppShell active="boards">
        <div className="card-surface p-10 text-center">
          <p className="font-medium">Tableau introuvable ou inaccessible.</p>
          <a href="/boards" className="mt-3 inline-block text-brand-600 hover:underline">← Retour aux tableaux</a>
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
    <AppShell active="boards">
      <BoardView
        board={board as never}
        currentUser={currentUser}
        isOwner={isOwner}
        canEdit={isMember}
      />
    </AppShell>
  );
}