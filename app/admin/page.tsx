import { AppShell } from "@/components/AppShell";
import { getServerTranslator } from "@/lib/i18n/server";
import { AdminPanel } from "./AdminPanel";
import { requirePageUser } from "@/lib/auth/page";
import { getAdminStats, listAdminBoards, listAdminUsers } from "@/lib/admin/service";
import { getKosmySettingsView } from "@/lib/kosmy-board/server";
import { headers } from "next/headers";
import { appBaseUrl, initiateLoginUri, redirectUri } from "@/lib/kosmy-board/oidc";

export default async function AdminPage() {
  const user = await requirePageUser({ path: "/admin", admin: true });

  const [users, boards, stats, kosmyView] = await Promise.all([
    listAdminUsers(),
    listAdminBoards(),
    getAdminStats(),
    getKosmySettingsView(),
  ]);

  // Kosmy Board sign-in settings. The client secret is never sent to the browser.
  const h = headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || "http";
  const base = appBaseUrl(`${proto}://${host}`);
  const kosmy = {
    ...kosmyView,
    base,
    redirectUri: redirectUri(base),
    loginUri: initiateLoginUri(base),
  };

  return (
    <AppShell active="admin" title={getServerTranslator()("admin.title")}>
      <AdminPanel users={users} boards={boards} stats={stats} currentUserId={user.id} kosmy={kosmy} />
    </AppShell>
  );
}